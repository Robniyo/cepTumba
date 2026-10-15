import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AppRole } from '../auth/auth-role.type';
import { toDateOnlyString } from '../common/date-utils';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCaseDto } from './dto/create-case.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { AddCaseNoteDto } from './dto/add-case-note.dto';
import { CreateVisitDto } from './dto/create-visit.dto';
import { UpdateVisitDto } from './dto/update-visit.dto';
import { CaseStatus, CaseType, Urgency, VisitStatus } from './welfare.types';

const WELFARE_MANAGER_ROLES: AppRole[] = [
  'president',
  'secretary',
  'vp_social',
  'advisor_social',
];

type CaseRow = {
  id: string;
  member_id: string;
  type: CaseType;
  title: string;
  description: string;
  urgency: Urgency;
  status: CaseStatus;
  opened_at: string;
  opened_by_user_id: string | null;
  opened_by: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type CaseNoteRow = {
  id: string;
  case_id: string;
  author_user_id: string | null;
  author: string;
  body: string;
  created_at: string;
};

type VisitRow = {
  id: string;
  case_id: string | null;
  member_id: string;
  scheduled_for: string;
  location: string;
  purpose: string;
  status: VisitStatus;
  report: string | null;
  created_by_user_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type VisitAttendeeRow = {
  visit_id: string;
  member_id: string;
  attended: boolean;
};

export type CaseResponse = {
  id: string;
  memberId: string;
  type: CaseType;
  title: string;
  description: string;
  urgency: Urgency;
  status: CaseStatus;
  openedAt: string;
  openedBy: string;
  closedAt: string | null;
  notes: CaseNoteResponse[];
  createdAt: string;
  updatedAt: string;
};

export type CaseNoteResponse = {
  id: string;
  caseId: string;
  author: string;
  authorUserId: string | null;
  body: string;
  createdAt: string;
};

export type VisitResponse = {
  id: string;
  caseId: string | null;
  memberId: string;
  scheduledFor: string;
  location: string;
  purpose: string;
  status: VisitStatus;
  report: string | null;
  createdBy: string;
  assigneeIds: string[];
  attendedIds: string[];
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class WelfareService implements OnModuleInit {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private dispatchNotificationSafely(
    promise: Promise<void>,
    failureAction: string,
    metadata: Record<string, unknown>,
  ): void {
    promise.catch((error) => {
      this.activityLogService.logSystem({
        action: failureAction,
        success: false,
        metadata: {
          ...metadata,
          reason: error instanceof Error ? error.message : 'unknown',
        },
      });
    });
  }

  private async resolveMemberName(memberId: string): Promise<string> {
    const result = await this.databaseService.query<{ full_name: string | null }>(
      `SELECT full_name FROM members WHERE id = $1 LIMIT 1`,
      [memberId],
    );
    return result.rows[0]?.full_name?.trim() || 'A member';
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  // --- Cases ---

  async listCases(currentUser: { role: AppRole }): Promise<CaseResponse[]> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('You do not have access to welfare cases');
    }
    const casesResult = await this.databaseService.query<CaseRow>(
      `
      SELECT c.id, c.member_id, c.type::text AS type, c.title, c.description,
             c.urgency::text AS urgency, c.status::text AS status,
             c.opened_at, c.opened_by_user_id,
             COALESCE(c.opened_by, u.display_name, u.email, 'System') AS opened_by,
             c.closed_at, c.created_at, c.updated_at
      FROM welfare_cases c
      LEFT JOIN users u ON u.id = c.opened_by_user_id
      ORDER BY c.created_at DESC
      `,
    );
    if (casesResult.rows.length === 0) return [];

    const ids = casesResult.rows.map((r) => r.id);
    const notesResult = await this.databaseService.query<CaseNoteRow>(
      `
      SELECT n.id, n.case_id, n.author_user_id,
             COALESCE(n.author_name, u.display_name, u.email, 'System') AS author,
             n.body, n.created_at
      FROM welfare_case_notes n
      LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.case_id = ANY($1::uuid[])
      ORDER BY n.created_at ASC
      `,
      [ids],
    );
    const notesByCase = new Map<string, CaseNoteResponse[]>();
    for (const n of notesResult.rows) {
      const arr = notesByCase.get(n.case_id) ?? [];
      arr.push(this.mapCaseNote(n));
      notesByCase.set(n.case_id, arr);
    }

    return casesResult.rows.map((r) =>
      this.mapCase(r, notesByCase.get(r.id) ?? []),
    );
  }

  async createCase(
    dto: CreateCaseDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<CaseResponse> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can open welfare cases');
    }
    const openedBy = await this.resolveDisplayName(currentUser.sub, currentUser.email);
    const status = dto.status ?? 'open';
    const closedAt = status === 'resolved' || status === 'closed' ? 'now()' : null;

    const result = await this.databaseService.query<CaseRow>(
      `
      INSERT INTO welfare_cases (
        member_id, type, title, description, urgency, status,
        opened_by_user_id, opened_by, closed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ${closedAt === null ? 'NULL' : closedAt})
      RETURNING id, member_id, type::text AS type, title, description,
                urgency::text AS urgency, status::text AS status,
                opened_at, opened_by_user_id, opened_by, closed_at,
                created_at, updated_at
      `,
      [
        dto.memberId,
        dto.type,
        dto.title.trim(),
        dto.description.trim(),
        dto.urgency,
        status,
        currentUser.sub,
        openedBy,
      ],
    );
    const created = this.mapCase(result.rows[0], []);
    void (async () => {
      const memberName = await this.resolveMemberName(created.memberId);
      this.dispatchNotificationSafely(
        this.notificationsService.notifyWelfareCaseOpened({
          caseId: created.id,
          title: created.title,
          type: created.type,
          urgency: created.urgency,
          memberName,
          openedBy: created.openedBy,
        }),
        'WELFARE_NOTIFY_FAILED',
        { case_id: created.id },
      );
    })();
    return created;
  }

  async updateCase(
    caseId: string,
    dto: UpdateCaseDto,
    currentUser: { role: AppRole },
  ): Promise<CaseResponse> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can update cases');
    }

    const result = await this.databaseService.query<CaseRow>(
      `
      UPDATE welfare_cases SET
        type = COALESCE($2::case_type, type),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        urgency = COALESCE($5::urgency, urgency),
        status = COALESCE($6::case_status, status),
        closed_at = CASE
          WHEN $6::case_status IN ('resolved','closed') AND closed_at IS NULL THEN now()
          WHEN $6::case_status IN ('open','in_progress') THEN NULL
          ELSE closed_at
        END,
        updated_at = now()
      WHERE id = $1
      RETURNING id, member_id, type::text AS type, title, description,
                urgency::text AS urgency, status::text AS status,
                opened_at, opened_by_user_id,
                COALESCE(opened_by, 'System') AS opened_by, closed_at,
                created_at, updated_at
      `,
      [
        caseId,
        dto.type ?? null,
        dto.title ?? null,
        dto.description ?? null,
        dto.urgency ?? null,
        dto.status ?? null,
      ],
    );
    if (result.rowCount === 0) throw new NotFoundException('Case not found');

    const notes = await this.loadCaseNotes(caseId);
    return this.mapCase(result.rows[0], notes);
  }

  async deleteCase(
    caseId: string,
    currentUser: { role: AppRole },
  ): Promise<{ deletedCaseId: string }> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can delete cases');
    }
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM welfare_cases WHERE id = $1 RETURNING id`,
      [caseId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Case not found');
    return { deletedCaseId: caseId };
  }

  async addCaseNote(
    caseId: string,
    dto: AddCaseNoteDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<CaseNoteResponse> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can add case notes');
    }
    const author = await this.resolveDisplayName(currentUser.sub, currentUser.email);
    const result = await this.databaseService.query<CaseNoteRow>(
      `
      INSERT INTO welfare_case_notes (case_id, author_user_id, author_name, body)
      VALUES ($1, $2, $3, $4)
      RETURNING id, case_id, author_user_id,
                COALESCE(author_name, 'System') AS author, body, created_at
      `,
      [caseId, currentUser.sub, author, dto.body.trim()],
    );
    return this.mapCaseNote(result.rows[0]);
  }

  // --- Visits ---

  async listVisits(currentUser: { role: AppRole }): Promise<VisitResponse[]> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('You do not have access to welfare visits');
    }
    const visitsResult = await this.databaseService.query<VisitRow>(
      `
      SELECT v.id, v.case_id, v.member_id, v.scheduled_for, v.location, v.purpose,
             v.status::text AS status, v.report, v.created_by_user_id,
             COALESCE(v.created_by, u.display_name, u.email, 'System') AS created_by,
             v.created_at, v.updated_at
      FROM welfare_visits v
      LEFT JOIN users u ON u.id = v.created_by_user_id
      ORDER BY v.scheduled_for DESC
      `,
    );
    if (visitsResult.rows.length === 0) return [];

    const ids = visitsResult.rows.map((r) => r.id);
    const attendeesResult = await this.databaseService.query<VisitAttendeeRow>(
      `SELECT visit_id, member_id, attended FROM welfare_visit_attendees WHERE visit_id = ANY($1::uuid[])`,
      [ids],
    );
    const assignees = new Map<string, string[]>();
    const attended = new Map<string, string[]>();
    for (const a of attendeesResult.rows) {
      const aList = assignees.get(a.visit_id) ?? [];
      aList.push(a.member_id);
      assignees.set(a.visit_id, aList);
      if (a.attended) {
        const tList = attended.get(a.visit_id) ?? [];
        tList.push(a.member_id);
        attended.set(a.visit_id, tList);
      }
    }

    return visitsResult.rows.map((v) =>
      this.mapVisit(v, assignees.get(v.id) ?? [], attended.get(v.id) ?? []),
    );
  }

  async createVisit(
    dto: CreateVisitDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<VisitResponse> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can create visits');
    }
    const createdBy = await this.resolveDisplayName(currentUser.sub, currentUser.email);
    const assignees = Array.from(new Set(dto.assigneeIds ?? []));

    return this.databaseService.withTransaction(async (client) => {
      const visitResult = await client.query<VisitRow>(
        `
        INSERT INTO welfare_visits (
          case_id, member_id, scheduled_for, location, purpose, status,
          created_by_user_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, case_id, member_id, scheduled_for, location, purpose,
                  status::text AS status, report, created_by_user_id, created_by,
                  created_at, updated_at
        `,
        [
          dto.caseId ?? null,
          dto.memberId,
          dto.scheduledFor,
          dto.location.trim(),
          dto.purpose.trim(),
          dto.status ?? 'planned',
          currentUser.sub,
          createdBy,
        ],
      );
      const visit = visitResult.rows[0];

      for (const memberId of assignees) {
        await client.query(
          `INSERT INTO welfare_visit_attendees (visit_id, member_id, attended)
           VALUES ($1, $2, false) ON CONFLICT DO NOTHING`,
          [visit.id, memberId],
        );
      }

      return this.mapVisit(visit, assignees, []);
    });
  }

  async updateVisit(
    visitId: string,
    dto: UpdateVisitDto,
    currentUser: { role: AppRole },
  ): Promise<VisitResponse> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can update visits');
    }

    return this.databaseService.withTransaction(async (client) => {
      const visitResult = await client.query<VisitRow>(
        `
        UPDATE welfare_visits SET
          scheduled_for = COALESCE($2, scheduled_for),
          location = COALESCE($3, location),
          purpose = COALESCE($4, purpose),
          status = COALESCE($5::visit_status, status),
          report = CASE WHEN $6::boolean THEN $7 ELSE report END,
          updated_at = now()
        WHERE id = $1
        RETURNING id, case_id, member_id, scheduled_for, location, purpose,
                  status::text AS status, report, created_by_user_id,
                  COALESCE(created_by, 'System') AS created_by,
                  created_at, updated_at
        `,
        [
          visitId,
          dto.scheduledFor ?? null,
          dto.location ?? null,
          dto.purpose ?? null,
          dto.status ?? null,
          dto.report !== undefined,
          dto.report ?? null,
        ],
      );
      if (visitResult.rowCount === 0) throw new NotFoundException('Visit not found');

      if (dto.assigneeIds !== undefined) {
        const newAssignees = Array.from(new Set(dto.assigneeIds));
        await client.query(
          `DELETE FROM welfare_visit_attendees WHERE visit_id = $1 AND NOT (member_id = ANY($2::uuid[]))`,
          [visitId, newAssignees],
        );
        for (const memberId of newAssignees) {
          await client.query(
            `INSERT INTO welfare_visit_attendees (visit_id, member_id, attended)
             VALUES ($1, $2, false) ON CONFLICT DO NOTHING`,
            [visitId, memberId],
          );
        }
      }

      const attendeesResult = await client.query<VisitAttendeeRow>(
        `SELECT visit_id, member_id, attended FROM welfare_visit_attendees WHERE visit_id = $1`,
        [visitId],
      );

      return this.mapVisit(
        visitResult.rows[0],
        attendeesResult.rows.map((a) => a.member_id),
        attendeesResult.rows.filter((a) => a.attended).map((a) => a.member_id),
      );
    });
  }

  async deleteVisit(
    visitId: string,
    currentUser: { role: AppRole },
  ): Promise<{ deletedVisitId: string }> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can delete visits');
    }
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM welfare_visits WHERE id = $1 RETURNING id`,
      [visitId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Visit not found');
    return { deletedVisitId: visitId };
  }

  async toggleAttendee(
    visitId: string,
    memberId: string,
    currentUser: { role: AppRole },
  ): Promise<VisitResponse> {
    if (!WELFARE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only social leadership can toggle attendance');
    }

    return this.databaseService.withTransaction(async (client) => {
      const existing = await client.query<{ attended: boolean }>(
        `SELECT attended FROM welfare_visit_attendees WHERE visit_id = $1 AND member_id = $2 LIMIT 1`,
        [visitId, memberId],
      );

      if (existing.rowCount === 0) {
        await client.query(
          `INSERT INTO welfare_visit_attendees (visit_id, member_id, attended) VALUES ($1, $2, true)`,
          [visitId, memberId],
        );
      } else {
        await client.query(
          `UPDATE welfare_visit_attendees SET attended = NOT attended WHERE visit_id = $1 AND member_id = $2`,
          [visitId, memberId],
        );
      }

      const visitResult = await client.query<VisitRow>(
        `
        SELECT id, case_id, member_id, scheduled_for, location, purpose,
               status::text AS status, report, created_by_user_id,
               COALESCE(created_by, 'System') AS created_by,
               created_at, updated_at
        FROM welfare_visits WHERE id = $1 LIMIT 1
        `,
        [visitId],
      );
      if (visitResult.rowCount === 0) throw new NotFoundException('Visit not found');

      const attendeesResult = await client.query<VisitAttendeeRow>(
        `SELECT visit_id, member_id, attended FROM welfare_visit_attendees WHERE visit_id = $1`,
        [visitId],
      );

      return this.mapVisit(
        visitResult.rows[0],
        attendeesResult.rows.map((a) => a.member_id),
        attendeesResult.rows.filter((a) => a.attended).map((a) => a.member_id),
      );
    });
  }

  // --- Helpers ---

  private async loadCaseNotes(caseId: string): Promise<CaseNoteResponse[]> {
    const result = await this.databaseService.query<CaseNoteRow>(
      `
      SELECT n.id, n.case_id, n.author_user_id,
             COALESCE(n.author_name, u.display_name, u.email, 'System') AS author,
             n.body, n.created_at
      FROM welfare_case_notes n
      LEFT JOIN users u ON u.id = n.author_user_id
      WHERE n.case_id = $1
      ORDER BY n.created_at ASC
      `,
      [caseId],
    );
    return result.rows.map((r) => this.mapCaseNote(r));
  }

  private async resolveDisplayName(userId: string, fallbackEmail: string) {
    const result = await this.databaseService.query<{
      display_name: string | null;
      email: string | null;
    }>(`SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (row?.display_name?.trim()) return row.display_name.trim();
    if (row?.email?.trim()) return row.email.trim();
    return fallbackEmail || 'System';
  }

  private mapCase(row: CaseRow, notes: CaseNoteResponse[]): CaseResponse {
    return {
      id: row.id,
      memberId: row.member_id,
      type: row.type,
      title: row.title,
      description: row.description,
      urgency: row.urgency,
      status: row.status,
      openedAt: row.opened_at,
      openedBy: row.opened_by,
      closedAt: row.closed_at,
      notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCaseNote(row: CaseNoteRow): CaseNoteResponse {
    return {
      id: row.id,
      caseId: row.case_id,
      author: row.author,
      authorUserId: row.author_user_id,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  private mapVisit(
    row: VisitRow,
    assigneeIds: string[],
    attendedIds: string[],
  ): VisitResponse {
    return {
      id: row.id,
      caseId: row.case_id,
      memberId: row.member_id,
      scheduledFor: row.scheduled_for,
      location: row.location,
      purpose: row.purpose,
      status: row.status,
      report: row.report,
      createdBy: row.created_by,
      assigneeIds,
      attendedIds,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_type') THEN
          CREATE TYPE case_type AS ENUM ('illness','bereavement','financial','academic','spiritual','celebration','other');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'case_status') THEN
          CREATE TYPE case_status AS ENUM ('open','in_progress','resolved','closed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'urgency') THEN
          CREATE TYPE urgency AS ENUM ('low','medium','high','critical');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visit_status') THEN
          CREATE TYPE visit_status AS ENUM ('planned','completed','cancelled');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS welfare_cases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        type case_type NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        urgency urgency NOT NULL DEFAULT 'medium',
        status case_status NOT NULL DEFAULT 'open',
        opened_at timestamptz NOT NULL DEFAULT now(),
        opened_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        opened_by text,
        closed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE welfare_cases ADD COLUMN IF NOT EXISTS opened_by text;
      ALTER TABLE welfare_cases ADD COLUMN IF NOT EXISTS opened_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE welfare_cases ADD COLUMN IF NOT EXISTS opened_at timestamptz NOT NULL DEFAULT now();
      ALTER TABLE welfare_cases ADD COLUMN IF NOT EXISTS closed_at timestamptz;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS welfare_case_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id uuid NOT NULL REFERENCES welfare_cases(id) ON DELETE CASCADE,
        author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        author_name text,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS welfare_visits (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        case_id uuid REFERENCES welfare_cases(id) ON DELETE SET NULL,
        member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        scheduled_for timestamptz NOT NULL,
        location text NOT NULL,
        purpose text NOT NULL,
        status visit_status NOT NULL DEFAULT 'planned',
        report text,
        created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE welfare_visits ADD COLUMN IF NOT EXISTS created_by text;
      ALTER TABLE welfare_visits ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS welfare_visit_attendees (
        visit_id uuid NOT NULL REFERENCES welfare_visits(id) ON DELETE CASCADE,
        member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        attended boolean NOT NULL DEFAULT false,
        PRIMARY KEY (visit_id, member_id)
      )
    `);
  }
}
