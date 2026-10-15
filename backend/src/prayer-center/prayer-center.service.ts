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
import { CreatePrayerRequestDto } from './dto/create-prayer-request.dto';
import { UpdatePrayerStatusDto } from './dto/update-prayer-status.dto';
import { CreateCounselingRequestDto } from './dto/create-counseling-request.dto';
import { UpdateCounselingStatusDto } from './dto/update-counseling-status.dto';
import { CreateTestimonyDto } from './dto/create-testimony.dto';
import { FollowUpStatus } from './prayer.types';

const PRAYER_REVIEWER_ROLES: AppRole[] = [
  'president',
  'vp_prayers',
  'advisor_prayers',
];

type PrayerRequestRow = {
  id: string;
  requester_user_id: string | null;
  requester: string;
  title: string;
  message: string;
  is_private: boolean;
  status: FollowUpStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

type CounselingRow = {
  id: string;
  requester_user_id: string | null;
  requester: string;
  summary: string;
  preferred_date: string | null;
  status: FollowUpStatus;
  counselor: string | null;
  created_at: string;
  updated_at: string;
};

type TestimonyRow = {
  id: string;
  author_user_id: string | null;
  author: string;
  body: string;
  created_at: string;
};

export type PrayerRequestResponse = {
  id: string;
  requesterUserId: string | null;
  requester: string;
  title: string;
  message: string;
  isPrivate: boolean;
  status: FollowUpStatus;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CounselingRequestResponse = {
  id: string;
  requesterUserId: string | null;
  requester: string;
  summary: string;
  preferredDate: string | null;
  status: FollowUpStatus;
  counselor: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TestimonyResponse = {
  id: string;
  authorUserId: string | null;
  author: string;
  body: string;
  createdAt: string;
};

@Injectable()
export class PrayerCenterService implements OnModuleInit {
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

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  // --- Prayer requests ---

  async listPrayerRequests(
    currentUser: { sub: string; role: AppRole },
  ): Promise<PrayerRequestResponse[]> {
    const isReviewer = PRAYER_REVIEWER_ROLES.includes(currentUser.role);

    const result = await this.databaseService.query<PrayerRequestRow>(
      `
      SELECT id, requester_user_id,
             COALESCE(requester, 'Anonymous') AS requester,
             title, message, is_private, status::text AS status, assigned_to,
             created_at, updated_at
      FROM prayer_requests
      WHERE $1::boolean = true OR is_private = false OR requester_user_id = $2
      ORDER BY created_at DESC
      `,
      [isReviewer, currentUser.sub],
    );
    return result.rows.map((r) => this.mapPrayer(r));
  }

  async createPrayerRequest(
    dto: CreatePrayerRequestDto,
    currentUser: { sub: string; email: string },
  ): Promise<PrayerRequestResponse> {
    const requester =
      dto.requester?.trim() ||
      (await this.resolveDisplayName(currentUser.sub, currentUser.email));

    const result = await this.databaseService.query<PrayerRequestRow>(
      `
      INSERT INTO prayer_requests (
        requester_user_id, requester, title, message, is_private, status
      ) VALUES ($1, $2, $3, $4, $5, 'new'::follow_up_status)
      RETURNING id, requester_user_id, requester, title, message, is_private,
                status::text AS status, assigned_to, created_at, updated_at
      `,
      [
        currentUser.sub,
        requester,
        dto.title.trim(),
        dto.message.trim(),
        dto.isPrivate ?? false,
      ],
    );
    const created = this.mapPrayer(result.rows[0]);
    this.dispatchNotificationSafely(
      this.notificationsService.notifyPrayerRequestCreated({
        requestId: created.id,
        title: created.title,
        requesterName: created.requester,
        isPrivate: created.isPrivate,
      }),
      'PRAYER_REQUEST_NOTIFY_FAILED',
      { request_id: created.id },
    );
    return created;
  }

  async updatePrayerStatus(
    id: string,
    dto: UpdatePrayerStatusDto,
    currentUser: { role: AppRole },
  ): Promise<PrayerRequestResponse> {
    if (!PRAYER_REVIEWER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only prayer leaders can update prayer status');
    }

    const result = await this.databaseService.query<PrayerRequestRow>(
      `
      UPDATE prayer_requests SET
        status = $2::follow_up_status,
        assigned_to = COALESCE($3, assigned_to),
        updated_at = now()
      WHERE id = $1
      RETURNING id, requester_user_id,
                COALESCE(requester, 'Anonymous') AS requester,
                title, message, is_private,
                status::text AS status, assigned_to, created_at, updated_at
      `,
      [id, dto.status, dto.assignedTo ?? null],
    );
    if (result.rowCount === 0) throw new NotFoundException('Prayer request not found');
    return this.mapPrayer(result.rows[0]);
  }

  async deletePrayerRequest(
    id: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ ok: true }> {
    const isReviewer = PRAYER_REVIEWER_ROLES.includes(currentUser.role);
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM prayer_requests
       WHERE id = $1 AND ($2::boolean OR requester_user_id = $3)
       RETURNING id`,
      [id, isReviewer, currentUser.sub],
    );
    if (result.rowCount === 0) throw new ForbiddenException('Cannot delete this prayer request');
    return { ok: true };
  }

  // --- Counseling requests ---

  async listCounselingRequests(
    currentUser: { sub: string; role: AppRole },
  ): Promise<CounselingRequestResponse[]> {
    const isReviewer = PRAYER_REVIEWER_ROLES.includes(currentUser.role);
    const result = await this.databaseService.query<CounselingRow>(
      `
      SELECT id, requester_user_id,
             COALESCE(requester, 'Anonymous') AS requester,
             summary, preferred_date, status::text AS status, counselor,
             created_at, updated_at
      FROM counseling_requests
      WHERE $1::boolean = true OR requester_user_id = $2
      ORDER BY created_at DESC
      `,
      [isReviewer, currentUser.sub],
    );
    return result.rows.map((r) => this.mapCounseling(r));
  }

  async createCounselingRequest(
    dto: CreateCounselingRequestDto,
    currentUser: { sub: string; email: string },
  ): Promise<CounselingRequestResponse> {
    const requester =
      dto.requester?.trim() ||
      (await this.resolveDisplayName(currentUser.sub, currentUser.email));

    const result = await this.databaseService.query<CounselingRow>(
      `
      INSERT INTO counseling_requests (
        requester_user_id, requester, summary, preferred_date, status
      ) VALUES ($1, $2, $3, $4, 'new'::follow_up_status)
      RETURNING id, requester_user_id, requester, summary, preferred_date,
                status::text AS status, counselor, created_at, updated_at
      `,
      [currentUser.sub, requester, dto.summary.trim(), dto.preferredDate ?? null],
    );
    return this.mapCounseling(result.rows[0]);
  }

  async updateCounselingStatus(
    id: string,
    dto: UpdateCounselingStatusDto,
    currentUser: { role: AppRole },
  ): Promise<CounselingRequestResponse> {
    if (!PRAYER_REVIEWER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only prayer leaders can update counseling status');
    }
    const result = await this.databaseService.query<CounselingRow>(
      `
      UPDATE counseling_requests SET
        status = $2::follow_up_status,
        counselor = COALESCE($3, counselor),
        updated_at = now()
      WHERE id = $1
      RETURNING id, requester_user_id,
                COALESCE(requester, 'Anonymous') AS requester,
                summary, preferred_date, status::text AS status, counselor,
                created_at, updated_at
      `,
      [id, dto.status, dto.counselor ?? null],
    );
    if (result.rowCount === 0) throw new NotFoundException('Counseling request not found');
    return this.mapCounseling(result.rows[0]);
  }

  async deleteCounselingRequest(
    id: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ ok: true }> {
    const isReviewer = PRAYER_REVIEWER_ROLES.includes(currentUser.role);
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM counseling_requests
       WHERE id = $1 AND ($2::boolean OR requester_user_id = $3)
       RETURNING id`,
      [id, isReviewer, currentUser.sub],
    );
    if (result.rowCount === 0) throw new ForbiddenException('Cannot delete this counseling request');
    return { ok: true };
  }

  // --- Testimonies ---

  async listTestimonies(): Promise<TestimonyResponse[]> {
    const result = await this.databaseService.query<TestimonyRow>(
      `SELECT id, author_user_id, COALESCE(author, 'Anonymous') AS author, body, created_at
       FROM testimonies ORDER BY created_at DESC`,
    );
    return result.rows.map((r) => this.mapTestimony(r));
  }

  async createTestimony(
    dto: CreateTestimonyDto,
    currentUser: { sub: string; email: string },
  ): Promise<TestimonyResponse> {
    const author =
      dto.author?.trim() ||
      (await this.resolveDisplayName(currentUser.sub, currentUser.email));
    const result = await this.databaseService.query<TestimonyRow>(
      `
      INSERT INTO testimonies (author_user_id, author, body)
      VALUES ($1, $2, $3)
      RETURNING id, author_user_id, author, body, created_at
      `,
      [currentUser.sub, author, dto.body.trim()],
    );
    return this.mapTestimony(result.rows[0]);
  }

  async deleteTestimony(
    id: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ ok: true }> {
    const isReviewer = PRAYER_REVIEWER_ROLES.includes(currentUser.role);
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM testimonies
       WHERE id = $1 AND ($2::boolean OR author_user_id = $3)
       RETURNING id`,
      [id, isReviewer, currentUser.sub],
    );
    if (result.rowCount === 0) throw new ForbiddenException('Cannot delete this testimony');
    return { ok: true };
  }

  // --- Helpers ---

  private async resolveDisplayName(userId: string, fallbackEmail: string) {
    const result = await this.databaseService.query<{
      display_name: string | null;
      email: string | null;
    }>(`SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (row?.display_name?.trim()) return row.display_name.trim();
    if (row?.email?.trim()) return row.email.trim();
    return fallbackEmail || 'Anonymous';
  }

  private mapPrayer(row: PrayerRequestRow): PrayerRequestResponse {
    return {
      id: row.id,
      requesterUserId: row.requester_user_id,
      requester: row.requester,
      title: row.title,
      message: row.message,
      isPrivate: row.is_private,
      status: row.status,
      assignedTo: row.assigned_to,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCounseling(row: CounselingRow): CounselingRequestResponse {
    return {
      id: row.id,
      requesterUserId: row.requester_user_id,
      requester: row.requester,
      summary: row.summary,
      preferredDate: toDateOnlyString(row.preferred_date),
      status: row.status,
      counselor: row.counselor,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTestimony(row: TestimonyRow): TestimonyResponse {
    return {
      id: row.id,
      authorUserId: row.author_user_id,
      author: row.author,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_status') THEN
          CREATE TYPE follow_up_status AS ENUM ('new','assigned','in_progress','closed');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS prayer_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        requester text NOT NULL DEFAULT '',
        title text NOT NULL,
        message text NOT NULL,
        is_private boolean NOT NULL DEFAULT false,
        status follow_up_status NOT NULL DEFAULT 'new',
        assigned_to text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE prayer_requests ADD COLUMN IF NOT EXISTS requester text NOT NULL DEFAULT ''
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS counseling_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        requester text NOT NULL DEFAULT '',
        summary text NOT NULL,
        preferred_date date,
        status follow_up_status NOT NULL DEFAULT 'new',
        counselor text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE counseling_requests ADD COLUMN IF NOT EXISTS requester text NOT NULL DEFAULT ''
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS testimonies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        author text NOT NULL DEFAULT '',
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE testimonies ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT ''
    `);
  }
}
