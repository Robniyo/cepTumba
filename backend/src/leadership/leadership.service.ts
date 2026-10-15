import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AppRole } from '../auth/auth-role.type';
import { toDateOnlyString } from '../common/date-utils';
import { DatabaseService } from '../database/database.service';
import { CreateCommitteeDto } from './dto/create-committee.dto';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { CreateTermDto } from './dto/create-term.dto';
import { UpdateCommitteeDto } from './dto/update-committee.dto';
import { UpdateTermStatusDto } from './dto/update-term-status.dto';
import { TermStatus } from './leadership.types';

const MANAGER_ROLES: AppRole[] = ['president', 'secretary'];

type TermRow = {
  id: string;
  role_title: string;
  holder_name: string;
  member_id: string | null;
  start_date: string | Date;
  end_date: string | Date;
  status: TermStatus;
  created_at: string;
  updated_at: string;
};

type CommitteeRow = {
  id: string;
  name: string;
  lead: string;
  members: string[];
  academic_year: string;
  created_at: string;
  updated_at: string;
};

type HandoverRow = {
  id: string;
  title: string;
  from_leader: string;
  to_leader: string;
  summary: string;
  created_at: string;
};

export type TermResponse = {
  id: string;
  roleTitle: string;
  holderName: string;
  memberId: string | null;
  startDate: string;
  endDate: string;
  status: TermStatus;
  createdAt: string;
  updatedAt: string;
};

export type CommitteeResponse = {
  id: string;
  name: string;
  lead: string;
  members: string[];
  academicYear: string;
  createdAt: string;
  updatedAt: string;
};

export type HandoverResponse = {
  id: string;
  title: string;
  fromLeader: string;
  toLeader: string;
  summary: string;
  createdAt: string;
};

const formatDate = (value: string | Date): string =>
  toDateOnlyString(value) ?? '';

@Injectable()
export class LeadershipService implements OnModuleInit {
  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  private assertManager(role: AppRole): void {
    if (!MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException('Only president or secretary can manage leadership');
    }
  }

  // ---------- Terms ----------

  async listTerms(): Promise<TermResponse[]> {
    const result = await this.databaseService.query<TermRow>(
      `SELECT id, role_title, holder_name, member_id, start_date, end_date,
              status::text AS status, created_at, updated_at
       FROM leadership_terms ORDER BY start_date DESC, created_at DESC`,
    );
    return result.rows.map((r) => this.mapTerm(r));
  }

  async createTerm(dto: CreateTermDto, role: AppRole): Promise<TermResponse> {
    this.assertManager(role);
    const result = await this.databaseService.query<TermRow>(
      `INSERT INTO leadership_terms (role_title, holder_name, member_id, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6::leadership_term_status)
       RETURNING id, role_title, holder_name, member_id, start_date, end_date,
                 status::text AS status, created_at, updated_at`,
      [
        dto.roleTitle.trim(),
        dto.holderName.trim(),
        dto.memberId ?? null,
        dto.startDate,
        dto.endDate,
        dto.status ?? 'upcoming',
      ],
    );
    return this.mapTerm(result.rows[0]);
  }

  async updateTermStatus(
    id: string,
    dto: UpdateTermStatusDto,
    role: AppRole,
  ): Promise<TermResponse> {
    this.assertManager(role);
    const result = await this.databaseService.query<TermRow>(
      `UPDATE leadership_terms
         SET status = $2::leadership_term_status, updated_at = now()
       WHERE id = $1
       RETURNING id, role_title, holder_name, member_id, start_date, end_date,
                 status::text AS status, created_at, updated_at`,
      [id, dto.status],
    );
    if (result.rowCount === 0) throw new NotFoundException('Term not found');
    return this.mapTerm(result.rows[0]);
  }

  async deleteTerm(id: string, role: AppRole): Promise<{ success: boolean }> {
    this.assertManager(role);
    const result = await this.databaseService.query(
      `DELETE FROM leadership_terms WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundException('Term not found');
    return { success: true };
  }

  // ---------- Committees ----------

  async listCommittees(): Promise<CommitteeResponse[]> {
    const result = await this.databaseService.query<CommitteeRow>(
      `SELECT id, name, lead, members, academic_year, created_at, updated_at
       FROM leadership_committees ORDER BY created_at DESC`,
    );
    return result.rows.map((r) => this.mapCommittee(r));
  }

  async createCommittee(
    dto: CreateCommitteeDto,
    role: AppRole,
  ): Promise<CommitteeResponse> {
    this.assertManager(role);
    const result = await this.databaseService.query<CommitteeRow>(
      `INSERT INTO leadership_committees (name, lead, academic_year, members)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, lead, members, academic_year, created_at, updated_at`,
      [dto.name.trim(), dto.lead.trim(), dto.academicYear.trim(), dto.members ?? []],
    );
    return this.mapCommittee(result.rows[0]);
  }

  async updateCommittee(
    id: string,
    dto: UpdateCommitteeDto,
    role: AppRole,
  ): Promise<CommitteeResponse> {
    this.assertManager(role);
    const result = await this.databaseService.query<CommitteeRow>(
      `UPDATE leadership_committees
          SET name = COALESCE($2, name),
              lead = COALESCE($3, lead),
              academic_year = COALESCE($4, academic_year),
              members = COALESCE($5, members),
              updated_at = now()
        WHERE id = $1
        RETURNING id, name, lead, members, academic_year, created_at, updated_at`,
      [
        id,
        dto.name?.trim() || null,
        dto.lead?.trim() || null,
        dto.academicYear?.trim() || null,
        dto.members ?? null,
      ],
    );
    if (result.rowCount === 0) throw new NotFoundException('Committee not found');
    return this.mapCommittee(result.rows[0]);
  }

  async deleteCommittee(id: string, role: AppRole): Promise<{ success: boolean }> {
    this.assertManager(role);
    const result = await this.databaseService.query(
      `DELETE FROM leadership_committees WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundException('Committee not found');
    return { success: true };
  }

  // ---------- Handovers ----------

  async listHandovers(): Promise<HandoverResponse[]> {
    const result = await this.databaseService.query<HandoverRow>(
      `SELECT id, title, from_leader, to_leader, summary, created_at
       FROM leadership_handovers ORDER BY created_at DESC`,
    );
    return result.rows.map((r) => this.mapHandover(r));
  }

  async createHandover(
    dto: CreateHandoverDto,
    role: AppRole,
  ): Promise<HandoverResponse> {
    this.assertManager(role);
    const result = await this.databaseService.query<HandoverRow>(
      `INSERT INTO leadership_handovers (title, from_leader, to_leader, summary)
       VALUES ($1, $2, $3, $4)
       RETURNING id, title, from_leader, to_leader, summary, created_at`,
      [
        dto.title.trim(),
        dto.fromLeader.trim(),
        dto.toLeader.trim(),
        dto.summary.trim(),
      ],
    );
    return this.mapHandover(result.rows[0]);
  }

  async deleteHandover(id: string, role: AppRole): Promise<{ success: boolean }> {
    this.assertManager(role);
    const result = await this.databaseService.query(
      `DELETE FROM leadership_handovers WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundException('Handover not found');
    return { success: true };
  }

  // ---------- Mappers ----------

  private mapTerm(row: TermRow): TermResponse {
    return {
      id: row.id,
      roleTitle: row.role_title,
      holderName: row.holder_name,
      memberId: row.member_id,
      startDate: formatDate(row.start_date),
      endDate: formatDate(row.end_date),
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCommittee(row: CommitteeRow): CommitteeResponse {
    return {
      id: row.id,
      name: row.name,
      lead: row.lead,
      members: row.members ?? [],
      academicYear: row.academic_year,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapHandover(row: HandoverRow): HandoverResponse {
    return {
      id: row.id,
      title: row.title,
      fromLeader: row.from_leader,
      toLeader: row.to_leader,
      summary: row.summary,
      createdAt: row.created_at,
    };
  }

  // ---------- Schema ----------

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'leadership_term_status') THEN
          CREATE TYPE leadership_term_status AS ENUM ('upcoming','active','completed');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS leadership_terms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        role_title text NOT NULL,
        holder_name text NOT NULL,
        member_id uuid REFERENCES members(id) ON DELETE SET NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        status leadership_term_status NOT NULL DEFAULT 'upcoming',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      ALTER TABLE leadership_terms
        ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES members(id) ON DELETE SET NULL;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS committees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL UNIQUE,
        lead_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS committee_members (
        committee_id uuid NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
        member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        added_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (committee_id, member_id)
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS handover_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        from_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
        from_leader_name text NOT NULL,
        to_member_id uuid REFERENCES members(id) ON DELETE SET NULL,
        to_leader_name text NOT NULL,
        summary text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS leadership_committees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        lead text NOT NULL,
        academic_year text NOT NULL,
        members text[] NOT NULL DEFAULT ARRAY[]::text[],
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      ALTER TABLE leadership_committees
        ADD COLUMN IF NOT EXISTS academic_year text;
    `);

    await this.databaseService.query(`
      UPDATE leadership_committees
         SET academic_year = COALESCE(
           NULLIF(academic_year, ''),
           to_char(current_date, 'YYYY') || '-' || to_char(current_date + interval '1 year', 'YYYY')
         )
       WHERE academic_year IS NULL OR academic_year = '';
    `);

    await this.databaseService.query(`
      ALTER TABLE leadership_committees
        ALTER COLUMN academic_year SET DEFAULT (to_char(current_date, 'YYYY') || '-' || to_char(current_date + interval '1 year', 'YYYY')),
        ALTER COLUMN academic_year SET NOT NULL;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS leadership_handovers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        from_leader text NOT NULL,
        to_leader text NOT NULL,
        summary text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}
