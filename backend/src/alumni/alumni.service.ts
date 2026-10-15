import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AppRole } from '../auth/auth-role.type';
import { DatabaseService } from '../database/database.service';
import { CreateAlumniDto } from './dto/create-alumni.dto';
import { UpdateAlumniDto } from './dto/update-alumni.dto';

const ALUMNI_VIEW_ROLES: AppRole[] = [
  'president',
  'secretary',
  'vp_social',
  'advisor_social',
];

const ALUMNI_MANAGER_ROLES: AppRole[] = ['president', 'vp_social'];

type AlumniRow = {
  member_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  graduation_year: number;
  current_role_title: string | null;
  mentor_available: boolean;
  contribution_total: number | null;
  last_engagement_at: string | null;
  created_at: string;
  updated_at: string;
};

type MemberIdentityRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type AlumniProfileRow = {
  member_id: string;
  graduation_year: number;
  current_role_title: string | null;
  mentor_available: boolean;
};

type Queryable = {
  query: <T extends QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<T>>;
};

export type AlumniResponse = {
  id: string;
  name: string;
  graduationYear: number;
  email: string | null;
  phone: string | null;
  currentRole: string;
  mentorAvailable: boolean;
  contributionTotal: number;
  lastEngagement: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class AlumniService implements OnModuleInit {
  constructor(private readonly databaseService: DatabaseService) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
    await this.ensureMemberNoSequence();
  }

  async listAlumni(requesterRole: AppRole): Promise<AlumniResponse[]> {
    this.assertViewer(requesterRole);
    const result = await this.databaseService.query<AlumniRow>(
      `
      SELECT
        ap.member_id,
        m.full_name,
        m.email,
        m.phone,
        ap.graduation_year,
        ap.current_role_title,
        ap.mentor_available,
        ap.contribution_total,
        ap.last_engagement_at,
        ap.created_at,
        ap.updated_at
      FROM alumni_profiles ap
      JOIN members m ON m.id = ap.member_id
      ORDER BY ap.created_at DESC, m.full_name ASC
      `,
    );

    return result.rows.map((row) => this.mapAlumni(row));
  }

  async createAlumni(
    dto: CreateAlumniDto,
    requesterRole: AppRole,
  ): Promise<AlumniResponse> {
    this.assertManager(requesterRole);

    const fullName = dto.fullName.trim();
    if (!fullName) {
      throw new BadRequestException('fullName is required');
    }

    const email = this.toNullableText(dto.email)?.toLowerCase() ?? null;
    const phone = this.toNullableText(dto.phone);
    const currentRoleTitle = this.toNullableText(dto.currentRoleTitle);
    const mentorAvailable = dto.mentorAvailable ?? false;

    try {
      const memberId = await this.databaseService.withTransaction(async (client) => {
        let targetMemberId: string;
        let member: MemberIdentityRow | undefined;

        if (email) {
          const existingMember = await client.query<MemberIdentityRow>(
            `
            SELECT id, full_name, email, phone
            FROM members
            WHERE email = $1
            LIMIT 1
            `,
            [email],
          );
          member = existingMember.rows[0];
        }

        if (member) {
          targetMemberId = member.id;
          await this.updateMemberIfNeeded(client, member, {
            fullName,
            email,
            phone,
          });
        } else {
          targetMemberId = await this.createMember(client, {
            fullName,
            email,
            phone,
          });
        }

        const existingProfile = await client.query(
          `SELECT 1 FROM alumni_profiles WHERE member_id = $1`,
          [targetMemberId],
        );

        if ((existingProfile.rowCount ?? 0) > 0) {
          throw new ConflictException('Alumni profile already exists');
        }

        await client.query(
          `
          INSERT INTO alumni_profiles (
            member_id,
            graduation_year,
            current_role_title,
            mentor_available,
            contribution_total,
            last_engagement_at
          )
          VALUES ($1, $2, $3, $4, 0, now())
          `,
          [
            targetMemberId,
            dto.graduationYear,
            currentRoleTitle,
            mentorAvailable,
          ],
        );

        return targetMemberId;
      });

      return await this.getAlumniByMemberId(memberId);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (this.isUniqueViolation(error)) {
        const constraint = this.getConstraintName(error);
        if (constraint === 'members_email_key') {
          throw new ConflictException('A member with this email already exists');
        }
        if (constraint === 'members_member_no_key') {
          throw new ConflictException('A member with this member number already exists');
        }
        throw new ConflictException('Duplicate alumni or member details provided');
      }

      throw error;
    }
  }

  async updateAlumni(
    memberId: string,
    dto: UpdateAlumniDto,
    requesterRole: AppRole,
  ): Promise<AlumniResponse> {
    this.assertManager(requesterRole);

    const hasUpdates =
      dto.fullName !== undefined ||
      dto.email !== undefined ||
      dto.phone !== undefined ||
      dto.graduationYear !== undefined ||
      dto.currentRoleTitle !== undefined ||
      dto.mentorAvailable !== undefined;

    if (!hasUpdates) {
      throw new BadRequestException('At least one field must be provided for update');
    }

    try {
      await this.databaseService.withTransaction(async (client) => {
        const memberResult = await client.query<MemberIdentityRow>(
          `
          SELECT id, full_name, email, phone
          FROM members
          WHERE id = $1
          LIMIT 1
          `,
          [memberId],
        );

        const member = memberResult.rows[0];
        if (!member) {
          throw new NotFoundException('Selected member was not found');
        }

        const profileResult = await client.query<AlumniProfileRow>(
          `
          SELECT member_id, graduation_year, current_role_title, mentor_available
          FROM alumni_profiles
          WHERE member_id = $1
          LIMIT 1
          `,
          [memberId],
        );

        const profile = profileResult.rows[0];
        if (!profile) {
          throw new NotFoundException('Alumni profile not found');
        }

        const nextFullName =
          dto.fullName !== undefined ? dto.fullName.trim() : member.full_name;
        if (!nextFullName) {
          throw new BadRequestException('fullName is required');
        }

        const nextEmail =
          dto.email !== undefined
            ? this.toNullableText(dto.email)?.toLowerCase() ?? null
            : member.email;
        const nextPhone =
          dto.phone !== undefined ? this.toNullableText(dto.phone) : member.phone;

        await this.updateMemberIfNeeded(client, member, {
          fullName: nextFullName,
          email: nextEmail,
          phone: nextPhone,
        });

        const nextGraduationYear =
          dto.graduationYear !== undefined
            ? dto.graduationYear
            : profile.graduation_year;
        const nextCurrentRoleTitle =
          dto.currentRoleTitle !== undefined
            ? this.toNullableText(dto.currentRoleTitle)
            : profile.current_role_title;
        const nextMentorAvailable =
          dto.mentorAvailable !== undefined
            ? dto.mentorAvailable
            : profile.mentor_available;

        const shouldUpdateProfile =
          nextGraduationYear !== profile.graduation_year ||
          nextCurrentRoleTitle !== profile.current_role_title ||
          nextMentorAvailable !== profile.mentor_available;

        if (shouldUpdateProfile) {
          await client.query(
            `
            UPDATE alumni_profiles
            SET
              graduation_year = $2,
              current_role_title = $3,
              mentor_available = $4,
              updated_at = now()
            WHERE member_id = $1
            `,
            [
              memberId,
              nextGraduationYear,
              nextCurrentRoleTitle,
              nextMentorAvailable,
            ],
          );
        }
      });

      return await this.getAlumniByMemberId(memberId);
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const constraint = this.getConstraintName(error);
        if (constraint === 'members_email_key') {
          throw new ConflictException('A member with this email already exists');
        }
        throw new ConflictException('Duplicate alumni or member details provided');
      }

      throw error;
    }
  }

  async addContribution(
    memberId: string,
    amount: number,
    requesterRole: AppRole,
  ): Promise<AlumniResponse> {
    this.assertManager(requesterRole);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    const result = await this.databaseService.query(
      `
      UPDATE alumni_profiles
      SET
        contribution_total = COALESCE(contribution_total, 0) + $2,
        last_engagement_at = now(),
        updated_at = now()
      WHERE member_id = $1
      `,
      [memberId, amount],
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundException('Alumni profile not found');
    }

    return this.getAlumniByMemberId(memberId);
  }

  async deleteAlumni(
    memberId: string,
    requesterRole: AppRole,
  ): Promise<{ success: boolean }> {
    this.assertManager(requesterRole);

    const result = await this.databaseService.query(
      `DELETE FROM alumni_profiles WHERE member_id = $1`,
      [memberId],
    );

    if ((result.rowCount ?? 0) === 0) {
      throw new NotFoundException('Alumni profile not found');
    }

    return { success: true };
  }

  private async getAlumniByMemberId(memberId: string): Promise<AlumniResponse> {
    const result = await this.databaseService.query<AlumniRow>(
      `
      SELECT
        ap.member_id,
        m.full_name,
        m.email,
        m.phone,
        ap.graduation_year,
        ap.current_role_title,
        ap.mentor_available,
        ap.contribution_total,
        ap.last_engagement_at,
        ap.created_at,
        ap.updated_at
      FROM alumni_profiles ap
      JOIN members m ON m.id = ap.member_id
      WHERE ap.member_id = $1
      LIMIT 1
      `,
      [memberId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Alumni profile not found');
    }

    return this.mapAlumni(row);
  }

  private mapAlumni(row: AlumniRow): AlumniResponse {
    return {
      id: row.member_id,
      name: row.full_name,
      graduationYear: row.graduation_year,
      email: row.email,
      phone: row.phone,
      currentRole: row.current_role_title ?? '',
      mentorAvailable: row.mentor_available,
      contributionTotal: row.contribution_total ?? 0,
      lastEngagement: row.last_engagement_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private assertViewer(role: AppRole): void {
    if (!ALUMNI_VIEW_ROLES.includes(role)) {
      throw new ForbiddenException('Only alumni viewers can access alumni');
    }
  }

  private assertManager(role: AppRole): void {
    if (!ALUMNI_MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException('Only alumni managers can manage alumni');
    }
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS alumni_profiles (
        member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
        graduation_year integer NOT NULL,
        current_role_title text,
        mentor_available boolean NOT NULL DEFAULT false,
        contribution_total integer NOT NULL DEFAULT 0,
        last_engagement_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      ALTER TABLE alumni_profiles
      ADD COLUMN IF NOT EXISTS contribution_total integer NOT NULL DEFAULT 0
    `);

    await this.databaseService.query(`
      ALTER TABLE alumni_profiles
      ADD COLUMN IF NOT EXISTS last_engagement_at timestamptz
    `);
  }

  private async ensureMemberNoSequence(): Promise<void> {
    await this.databaseService.query(
      `CREATE SEQUENCE IF NOT EXISTS member_no_seq START WITH 1 INCREMENT BY 1`,
    );
    const result = await this.databaseService.query<{ next: string | null }>(
      `SELECT COALESCE(MAX((regexp_replace(member_no, '\\D', '', 'g'))::int), 0) + 1 AS next
         FROM members
         WHERE member_no ~ '^CTC-\\d+$'`,
    );
    const next = Number(result.rows[0]?.next ?? 1);
    if (Number.isFinite(next) && next > 0) {
      await this.databaseService.query(
        `SELECT setval('member_no_seq', $1::bigint, false)`,
        [next],
      );
    }
  }

  private async generateMemberNo(client: Queryable): Promise<string> {
    const result = await client.query<{ nextval: string }>(
      `SELECT nextval('member_no_seq') AS nextval`,
    );
    const n = Number(result.rows[0]?.nextval ?? 0);
    return `CTC-${String(n).padStart(4, '0')}`;
  }

  private async createMember(
    client: PoolClient,
    payload: {
      fullName: string;
      email: string | null;
      phone: string | null;
    },
  ): Promise<string> {
    const memberNo = await this.generateMemberNo(client);
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO members (member_no, full_name, email, phone, status)
      VALUES ($1, $2, $3, $4, 'graduated')
      RETURNING id
      `,
      [memberNo, payload.fullName, payload.email, payload.phone],
    );
    return result.rows[0].id;
  }

  private async updateMemberIfNeeded(
    client: PoolClient,
    member: MemberIdentityRow,
    next: { fullName: string; email: string | null; phone: string | null },
  ): Promise<void> {
    const shouldUpdate =
      member.full_name !== next.fullName ||
      member.email !== next.email ||
      member.phone !== next.phone;

    if (!shouldUpdate) {
      return;
    }

    await client.query(
      `
      UPDATE members
      SET full_name = $2, email = $3, phone = $4, updated_at = now()
      WHERE id = $1
      `,
      [member.id, next.fullName, next.email, next.phone],
    );
  }

  private toNullableText(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as { code?: string };
    return maybeError.code === '23505';
  }

  private getConstraintName(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const maybeError = error as { constraint?: string };
    return maybeError.constraint;
  }
}
