import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PoolClient } from 'pg';
import { todayDateOnlyString } from '../common/date-utils';
import { buildExportStamp, exportTable, ExportColumn, ExportFormat } from '../common/export-utils';
import { DatabaseService } from '../database/database.service';
import { AppRole } from '../auth/auth-role.type';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

type MemberStatus = 'active' | 'inactive' | 'graduated' | 'suspended';
type Gender = 'male' | 'female' | 'other';

type MemberRow = {
  id: string;
  member_no: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  year_of_study: string | null;
  fellowship: string | null;
  status: MemberStatus;
  joined_at: string | null;
  baptized: boolean;
  avatar_hue: number;
  date_of_birth: string | null;
  gender: Gender | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  role: AppRole;
};

type MemberIdentityRow = {
  id: string;
  email: string | null;
  full_name: string;
};

type LinkedUserRoleRow = {
  id: string;
  role: AppRole;
};

type LinkedUserIdentityRow = {
  id: string;
  email: string;
  display_name: string;
};

type MemberResponse = {
  id: string;
  memberNo: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  yearOfStudy: string | null;
  fellowship: string | null;
  status: MemberStatus;
  joinedAt: string | null;
  baptized: boolean;
  avatarHue: number;
  dateOfBirth: string | null;
  gender: Gender | null;
  createdAt: string;
  updatedAt: string;
};

type CreatedUserResponse = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
};

type CreatedMemberResponse = {
  member: MemberResponse;
  user: CreatedUserResponse | null;
  defaultPassword: string | null;
};

type AssignedRoleUserResponse = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
};

type DeletedMemberResponse = {
  deletedMemberId: string;
  deletedUserId: string | null;
};

const MEMBER_MANAGER_ROLES: AppRole[] = ['president', 'secretary', 'vp_social'];
const LEADERSHIP_MANAGER_ROLES: AppRole[] = ['president', 'secretary'];

@Injectable()
export class MembersService implements OnModuleInit {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureMemberNoSequence();
  }

  private async ensureMemberNoSequence(): Promise<void> {
    // Sequence used to auto-generate CTC-NNNN member numbers.
    // Initialize starting from MAX existing numeric suffix + 1 so we don't
    // collide with manually-assigned numbers.
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

  private async generateMemberNo(): Promise<string> {
    const result = await this.databaseService.query<{ nextval: string }>(
      `SELECT nextval('member_no_seq') AS nextval`,
    );
    const n = Number(result.rows[0].nextval);
    return `CTC-${String(n).padStart(4, '0')}`;
  }

  async listPublicLeadership(): Promise<{ id: string; fullName: string; role: string; description: string }[]> {
    const leadershipRoles: AppRole[] = ['president', 'vp_prayers', 'vp_social', 'secretary', 'accountant'];
    
    const result = await this.databaseService.query<{ id: string; full_name: string; role: AppRole }>(
      `
      SELECT m.id, m.full_name, u.role
      FROM members m
      JOIN users u ON u.email = m.email
      WHERE u.role = ANY($1::app_role[])
        AND m.status = 'active'
      ORDER BY 
        CASE u.role
          WHEN 'president' THEN 1
          WHEN 'vp_prayers' THEN 2
          WHEN 'vp_social' THEN 3
          WHEN 'secretary' THEN 4
          WHEN 'accountant' THEN 5
          ELSE 6
        END
      `,
      [leadershipRoles],
    );

    const roleDescriptions: Record<AppRole, string> = {
      president: 'Leading with vision and dedication to our mission.',
      vp_prayers: 'Overseeing spiritual growth and outreach initiatives.',
      vp_social: 'Building community through social activities and fellowship.',
      secretary: 'Managing communications and organizational records.',
      accountant: 'Ensuring financial transparency and accountability.',
      advisor_prayers: 'Advising on spiritual matters and prayer initiatives.',
      advisor_social: 'Advising on social activities and community building.',
      member: '',
    };

    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      description: roleDescriptions[row.role] || '',
    }));
  }

  async listMembers(requesterRole: AppRole): Promise<MemberResponse[]> {
    if (!MEMBER_MANAGER_ROLES.includes(requesterRole)) {
      throw new ForbiddenException(
        'Only member managers can view members (president, secretary, vp_social)',
      );
    }

    const result = await this.databaseService.query<MemberRow>(
      `
      SELECT
        id,
        member_no,
        full_name,
        email,
        phone,
        department,
        year_of_study,
        fellowship,
        status,
        joined_at,
        baptized,
        avatar_hue,
        date_of_birth,
        gender::text AS gender,
        created_at,
        updated_at
      FROM members
      ORDER BY created_at DESC, full_name ASC
      `,
    );

    return result.rows.map((row) => this.mapMemberRow(row));
  }

  async exportMembers(
    format: ExportFormat,
    requesterRole: AppRole,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const members = await this.listMembers(requesterRole);
    const columns: ExportColumn<MemberResponse>[] = [
      { key: 'id', header: 'ID' },
      { key: 'memberNo', header: 'Member No' },
      { key: 'fullName', header: 'Full Name' },
      { key: 'email', header: 'Email' },
      { key: 'phone', header: 'Phone' },
      { key: 'department', header: 'Department' },
      { key: 'yearOfStudy', header: 'Year Of Study' },
      { key: 'fellowship', header: 'Fellowship' },
      { key: 'status', header: 'Status' },
      { key: 'joinedAt', header: 'Joined At' },
      { key: 'baptized', header: 'Baptized' },
      { key: 'dateOfBirth', header: 'Date Of Birth' },
      { key: 'gender', header: 'Gender' },
      { key: 'createdAt', header: 'Created At' },
      { key: 'updatedAt', header: 'Updated At' },
    ];
    const { buffer, contentType, extension } = await exportTable(
      'Members',
      members,
      columns,
      format,
    );
    const stamp = buildExportStamp();
    return {
      buffer,
      contentType,
      fileName: `members_${stamp}.${extension}`,
    };
  }

  async createMember(
    dto: CreateMemberDto,
    creatorRole: AppRole,
  ): Promise<CreatedMemberResponse> {
    if (!MEMBER_MANAGER_ROLES.includes(creatorRole)) {
      throw new ForbiddenException(
        'Only member managers can add members (president, secretary, vp_social)',
      );
    }

    const fullName = dto.fullName.trim();
    if (!fullName) {
      throw new BadRequestException('fullName is required');
    }

    let memberNo = dto.memberNo?.trim() ?? '';
    if (!memberNo) {
      // Auto-generate; retry a few times in case of rare race/collision.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = await this.generateMemberNo();
        const exists = await this.databaseService.query(
          `SELECT 1 FROM members WHERE member_no = $1 LIMIT 1`,
          [candidate],
        );
        if (exists.rowCount === 0) {
          memberNo = candidate;
          break;
        }
      }
      if (!memberNo) {
        throw new ConflictException('Could not allocate a unique member number');
      }
    }

    const shouldCreateUserAccount = creatorRole === 'president';
    const normalizedEmail = this.toNullableText(dto.email)?.toLowerCase() ?? null;

    if (shouldCreateUserAccount && !normalizedEmail) {
      throw new BadRequestException(
        'Email is required when president adds a member so an account can be created',
      );
    }

    const payload = {
      memberNo,
      fullName,
      email: normalizedEmail,
      phone: this.toNullableText(dto.phone),
      department: this.toNullableText(dto.department),
      yearOfStudy: this.toNullableText(dto.yearOfStudy),
      fellowship: this.toNullableText(dto.fellowship),
      status: dto.status ?? 'active',
      joinedAt: dto.joinedAt ?? todayDateOnlyString(),
      baptized: dto.baptized ?? false,
      avatarHue: dto.avatarHue ?? this.randomAvatarHue(),
      dateOfBirth: dto.dateOfBirth ?? null,
      gender: dto.gender ?? null,
    };

    try {
      const created = await this.databaseService.withTransaction(async (client) => {
        const member = await this.insertMember(client, payload);

        if (!shouldCreateUserAccount || !payload.email) {
          return {
            member,
            user: null,
            defaultPassword: null,
          };
        }

        const defaultPassword = this.generateRandomPassword(10);

        const passwordHash = await bcrypt.hash(
          defaultPassword,
          this.getBcryptSaltRounds(),
        );
        const user = await this.insertMemberUser(client, {
          memberId: member.id,
          email: payload.email,
          fullName: payload.fullName,
          passwordHash,
        });

        return {
          member,
          user,
          defaultPassword,
        };
      });

      if (created.user && created.defaultPassword) {
        // Send credentials email and wait for it to complete
        await this.sendCredentialsEmailIfPossible({
          email: created.user.email,
          fullName: created.user.name,
          password: created.defaultPassword,
        }).catch((err) => {
          this.logger.error(
            `Failed to send credentials email to ${created.user?.email}: ${String(err)}`,
          );
        });
      }

      return created;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const constraint = this.getConstraintName(error);
        if (constraint === 'members_member_no_key') {
          throw new ConflictException('A member with this member number already exists');
        }
        if (constraint === 'members_email_key') {
          throw new ConflictException('A member with this email already exists');
        }
        if (constraint === 'users_email_key') {
          throw new ConflictException('A user account with this email already exists');
        }
        throw new ConflictException('Duplicate member or user details provided');
      }
      throw error;
    }
  }

  async assignMemberRole(
    memberId: string,
    newRole: AppRole,
    requesterRole: AppRole,
  ): Promise<{ user: AssignedRoleUserResponse; defaultPassword: string | null }> {
    if (!LEADERSHIP_MANAGER_ROLES.includes(requesterRole)) {
      throw new ForbiddenException(
        'Only leadership managers can assign roles (president, secretary)',
      );
    }

    const memberResult = await this.databaseService.query<MemberIdentityRow>(
      `
      SELECT id, email, full_name
      FROM members
      WHERE id = $1
      LIMIT 1
      `,
      [memberId],
    );

    const member = memberResult.rows[0];
    if (!member) {
      throw new BadRequestException('Selected member was not found');
    }

    let userResult = await this.databaseService.query<UserRow>(
      `
      UPDATE users
      SET role = $2, updated_at = now()
      WHERE member_id = $1
      RETURNING id, email, display_name, role
      `,
      [memberId, newRole],
    );

    if (userResult.rowCount === 0 && member.email) {
      // Legacy fallback: some users may exist without member_id linkage.
      userResult = await this.databaseService.query<UserRow>(
        `
        UPDATE users
        SET role = $2, member_id = COALESCE(member_id, $1), updated_at = now()
        WHERE email = $3
        RETURNING id, email, display_name, role
        `,
        [memberId, newRole, member.email],
      );
    }

    if (userResult.rowCount === 0) {
      if (!member.email) {
        throw new BadRequestException(
          'Selected member has no email, so a user account cannot be created',
        );
      }

      const defaultPassword = this.generateRandomPassword(10);

      const passwordHash = await bcrypt.hash(
        defaultPassword,
        this.getBcryptSaltRounds(),
      );

      try {
        userResult = await this.databaseService.query<UserRow>(
          `
          INSERT INTO users (
            email,
            password_hash,
            display_name,
            role,
            member_id,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, true)
          RETURNING id, email, display_name, role
          `,
          [member.email, passwordHash, member.full_name, newRole, member.id],
        );

        const createdUser = userResult.rows[0];
        const response = {
          user: {
            id: createdUser.id,
            email: createdUser.email,
            name: createdUser.display_name,
            role: createdUser.role,
          },
          defaultPassword,
        };

        await this.sendCredentialsEmailIfPossible({
          email: response.user.email,
          fullName: response.user.name,
          password: defaultPassword,
        });

        return response;
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException(
            'A user account already exists with this member email',
          );
        }
        throw error;
      }
    }

    const updatedUser = userResult.rows[0];
    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.display_name,
        role: updatedUser.role,
      },
      defaultPassword: null,
    };
  }

  async updateMember(
    memberId: string,
    dto: UpdateMemberDto,
    requesterRole: AppRole,
  ): Promise<{ member: MemberResponse }> {
    if (!MEMBER_MANAGER_ROLES.includes(requesterRole)) {
      throw new ForbiddenException(
        'Only member managers can update members (president, secretary, vp_social)',
      );
    }

    const hasUpdates =
      dto.memberNo !== undefined ||
      dto.fullName !== undefined ||
      dto.email !== undefined ||
      dto.phone !== undefined ||
      dto.department !== undefined ||
      dto.yearOfStudy !== undefined ||
      dto.fellowship !== undefined ||
      dto.baptized !== undefined;

    if (!hasUpdates) {
      throw new BadRequestException('At least one field must be provided for update');
    }

    try {
      return await this.databaseService.withTransaction(async (client) => {
        const existingResult = await client.query<MemberRow>(
          `
          SELECT
            id,
            member_no,
            full_name,
            email,
            phone,
            department,
            year_of_study,
            fellowship,
            status,
            joined_at,
            baptized,
            avatar_hue,
            date_of_birth,
            gender::text AS gender,
            created_at,
            updated_at
          FROM members
          WHERE id = $1
          LIMIT 1
          `,
          [memberId],
        );

        const existingMember = existingResult.rows[0];
        if (!existingMember) {
          throw new NotFoundException('Selected member was not found');
        }

        const nextMemberNo =
          dto.memberNo !== undefined ? dto.memberNo.trim() : existingMember.member_no;
        const nextFullName =
          dto.fullName !== undefined ? dto.fullName.trim() : existingMember.full_name;

        if (!nextMemberNo || !nextFullName) {
          throw new BadRequestException('memberNo and fullName are required');
        }

        const nextEmail =
          dto.email !== undefined
            ? this.toNullableText(dto.email ?? undefined)?.toLowerCase() ?? null
            : existingMember.email;

        const nextPhone =
          dto.phone !== undefined ? this.toNullableText(dto.phone) : existingMember.phone;
        const nextDepartment =
          dto.department !== undefined
            ? this.toNullableText(dto.department)
            : existingMember.department;
        const nextYearOfStudy =
          dto.yearOfStudy !== undefined
            ? this.toNullableText(dto.yearOfStudy)
            : existingMember.year_of_study;
        const nextFellowship =
          dto.fellowship !== undefined
            ? this.toNullableText(dto.fellowship)
            : existingMember.fellowship;
        const nextBaptized =
          dto.baptized !== undefined ? dto.baptized : existingMember.baptized;
        const nextGender =
          dto.gender !== undefined ? dto.gender : existingMember.gender;

        let linkedUserResult = await client.query<LinkedUserIdentityRow>(
          `
          SELECT id, email, display_name
          FROM users
          WHERE member_id = $1
          LIMIT 1
          `,
          [memberId],
        );

        if (linkedUserResult.rowCount === 0 && existingMember.email) {
          // Legacy fallback: some users may exist without member_id linkage.
          linkedUserResult = await client.query<LinkedUserIdentityRow>(
            `
            SELECT id, email, display_name
            FROM users
            WHERE email = $1
            LIMIT 1
            `,
            [existingMember.email],
          );
        }

        const linkedUser = linkedUserResult.rows[0];
        if (linkedUser && !nextEmail) {
          throw new BadRequestException(
            'Cannot clear email because this member has a linked user account',
          );
        }

        if (linkedUser) {
          await client.query(
            `
            UPDATE users
            SET
              email = $2,
              display_name = $3,
              member_id = COALESCE(member_id, $4),
              updated_at = now()
            WHERE id = $1
            `,
            [linkedUser.id, nextEmail, nextFullName, memberId],
          );
        }

        const updatedResult = await client.query<MemberRow>(
          `
          UPDATE members
          SET
            member_no = $2,
            full_name = $3,
            email = $4,
            phone = $5,
            department = $6,
            year_of_study = $7,
            fellowship = $8,
            baptized = $9,
            gender = $10::gender_kind,
            updated_at = now()
          WHERE id = $1
          RETURNING
            id,
            member_no,
            full_name,
            email,
            phone,
            department,
            year_of_study,
            fellowship,
            status,
            joined_at,
            baptized,
            avatar_hue,
            date_of_birth,
            gender::text AS gender,
            created_at,
            updated_at
          `,
          [
            memberId,
            nextMemberNo,
            nextFullName,
            nextEmail,
            nextPhone,
            nextDepartment,
            nextYearOfStudy,
            nextFellowship,
            nextBaptized,
            nextGender,
          ],
        );

        return {
          member: this.mapMemberRow(updatedResult.rows[0]),
        };
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const constraint = this.getConstraintName(error);
        if (constraint === 'members_member_no_key') {
          throw new ConflictException('A member with this member number already exists');
        }
        if (constraint === 'members_email_key') {
          throw new ConflictException('A member with this email already exists');
        }
        if (constraint === 'users_email_key') {
          throw new ConflictException('A user account with this email already exists');
        }
        throw new ConflictException('Duplicate member or user details provided');
      }
      throw error;
    }
  }

  async updateMemberStatus(
    memberId: string,
    status: MemberStatus,
    requesterRole: AppRole,
  ): Promise<{ member: MemberResponse }> {
    if (!MEMBER_MANAGER_ROLES.includes(requesterRole)) {
      throw new ForbiddenException(
        'Only member managers can update member status (president, secretary, vp_social)',
      );
    }

    const result = await this.databaseService.query<MemberRow>(
      `
      UPDATE members
      SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING
        id,
        member_no,
        full_name,
        email,
        phone,
        department,
        year_of_study,
        fellowship,
        status,
        joined_at,
        baptized,
        avatar_hue,
        date_of_birth,
        gender::text AS gender,
        created_at,
        updated_at
      `,
      [memberId, status],
    );

    const updatedMember = result.rows[0];
    if (!updatedMember) {
      throw new NotFoundException('Selected member was not found');
    }

    return {
      member: this.mapMemberRow(updatedMember),
    };
  }

  async deleteMember(
    memberId: string,
    requesterRole: AppRole,
    requesterUserId: string,
  ): Promise<DeletedMemberResponse> {
    if (!MEMBER_MANAGER_ROLES.includes(requesterRole)) {
      throw new ForbiddenException(
        'Only member managers can delete members (president, secretary, vp_social)',
      );
    }

    try {
      return await this.databaseService.withTransaction(async (client) => {
        const memberResult = await client.query<MemberIdentityRow>(
          `
          SELECT id, email, full_name
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

        let linkedUserResult = await client.query<LinkedUserRoleRow>(
          `
          SELECT id, role
          FROM users
          WHERE member_id = $1
          LIMIT 1
          `,
          [member.id],
        );

        if (linkedUserResult.rowCount === 0 && member.email) {
          // Legacy fallback: some users may exist without member_id linkage.
          linkedUserResult = await client.query<LinkedUserRoleRow>(
            `
            SELECT id, role
            FROM users
            WHERE email = $1
            LIMIT 1
            `,
            [member.email],
          );
        }

        const linkedUser = linkedUserResult.rows[0];
        if (linkedUser?.id === requesterUserId) {
          throw new BadRequestException('You cannot delete your own account');
        }

        if (linkedUser && linkedUser.role !== 'member') {
          throw new ConflictException(
            'This member currently has a leadership role. Reassign the role before deleting.',
          );
        }
        // Cascade delete all related records before deleting the member
        // Wrap in try-catch in case tables don't exist in production schema
        const tableDeletes = [
          { table: 'committee_members', column: 'member_id' },
          { table: 'event_attendance', column: 'member_id' },
          { table: 'minute_participants', column: 'member_id' },
          { table: 'welfare_cases', column: 'member_id' },
          { table: 'welfare_visits', column: 'member_id' },
          { table: 'welfare_visit_assignees', column: 'member_id' },
          { table: 'welfare_visit_attendees', column: 'member_id' },
        ];

        for (const { table, column } of tableDeletes) {
          const tableExistsResult = await client.query<{ exists: boolean }>(
            `SELECT EXISTS (
              SELECT 1
              FROM information_schema.tables
              WHERE table_schema = 'public'
                AND table_name = $1
            ) AS exists`,
            [table],
          );

          if (!tableExistsResult.rows[0]?.exists) {
            this.logger.debug(`Table ${table} does not exist, skipping cleanup`);
            continue;
          }

          await client.query(
            `DELETE FROM ${table} WHERE ${column} = $1`,
            [member.id],
          );
        }

        // Delete messaging records tied to the member's user account
        if (linkedUser) {
          // Delete the user's messages by setting sender_id to NULL
          await client.query(
            `UPDATE messages SET sender_id = NULL WHERE sender_id = $1`,
            [linkedUser.id],
          );
          // Remove finance payment ownership so the user row can be deleted
          await client.query(
            `UPDATE finance_mobile_money_payments SET initiated_by_user_id = NULL WHERE initiated_by_user_id = $1`,
            [linkedUser.id],
          );
          // Remove them from all conversations
          await client.query(
            `DELETE FROM conversation_participants WHERE user_id = $1`,
            [linkedUser.id],
          );
        }

        // Remove finance payment references to the member record itself
        await client.query(
          `UPDATE finance_mobile_money_payments SET member_id = NULL WHERE member_id = $1`,
          [member.id],
        );

        if (linkedUser) {
          await client.query(
            `
            DELETE FROM users
            WHERE id = $1
            `,
            [linkedUser.id],
          );
        }

        await client.query(
          `
          DELETE FROM members
          WHERE id = $1
          `,
          [member.id],
        );

        return {
          deletedMemberId: member.id,
          deletedUserId: linkedUser?.id ?? null,
        };
      });
    } catch (error) {
      const errorObj = error as any;
      const errorCode = errorObj?.code;
      const errorConstraint = errorObj?.constraint;
      const errorDetail = errorObj?.detail;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Member deletion failed for memberId=${memberId}: ${errorMessage}`,
        {
          code: errorCode,
          constraint: errorConstraint,
          detail: errorDetail,
          stack: error instanceof Error ? error.stack : undefined,
        },
      );

      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      // Unique constraint violation
      if (errorCode === '23505') {
        throw new ConflictException('Duplicate record exists. Cannot complete deletion.');
      }

      // Foreign key constraint violation
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          `Cannot delete member due to linked records in table: ${errorConstraint || 'unknown'}. Please manually delete those records first.`,
        );
      }

      throw new ConflictException(
        'Failed to delete member. Please try again or contact support if the problem persists.',
      );
    }
  }

  private async insertMember(
    client: PoolClient,
    payload: {
      memberNo: string;
      fullName: string;
      email: string | null;
      phone: string | null;
      department: string | null;
      yearOfStudy: string | null;
      fellowship: string | null;
      status: MemberStatus;
      joinedAt: string;
      baptized: boolean;
      avatarHue: number;
      dateOfBirth: string | null;
      gender: Gender | null;
    },
  ): Promise<MemberResponse> {
    const result = await client.query<MemberRow>(
      `
      INSERT INTO members (
        member_no,
        full_name,
        email,
        phone,
        department,
        year_of_study,
        fellowship,
        status,
        joined_at,
        baptized,
        avatar_hue,
        date_of_birth,
        gender
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13::gender_kind
      )
      RETURNING
        id,
        member_no,
        full_name,
        email,
        phone,
        department,
        year_of_study,
        fellowship,
        status,
        joined_at,
        baptized,
        avatar_hue,
        date_of_birth,
        gender::text AS gender,
        created_at,
        updated_at
      `,
      [
        payload.memberNo,
        payload.fullName,
        payload.email,
        payload.phone,
        payload.department,
        payload.yearOfStudy,
        payload.fellowship,
        payload.status,
        payload.joinedAt,
        payload.baptized,
        payload.avatarHue,
        payload.dateOfBirth,
        payload.gender,
      ],
    );

    return this.mapMemberRow(result.rows[0]);
  }

  private async insertMemberUser(
    client: PoolClient,
    payload: {
      memberId: string;
      email: string;
      fullName: string;
      passwordHash: string;
    },
  ): Promise<CreatedUserResponse> {
    const result = await client.query<UserRow>(
      `
      INSERT INTO users (
        email,
        password_hash,
        display_name,
        role,
        member_id,
        is_active
      )
      VALUES ($1, $2, $3, 'member', $4, true)
      RETURNING id, email, display_name, role
      `,
      [
        payload.email,
        payload.passwordHash,
        payload.fullName,
        payload.memberId,
      ],
    );

    return {
      id: result.rows[0].id,
      email: result.rows[0].email,
      name: result.rows[0].display_name,
      role: result.rows[0].role,
    };
  }

  private mapMemberRow(row: MemberRow): MemberResponse {
    return {
      id: row.id,
      memberNo: row.member_no,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      department: row.department,
      yearOfStudy: row.year_of_study,
      fellowship: row.fellowship,
      status: row.status,
      joinedAt: row.joined_at,
      baptized: row.baptized,
      avatarHue: row.avatar_hue,
      dateOfBirth: row.date_of_birth,
      gender: row.gender ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toNullableText(value?: string): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private randomAvatarHue(): number {
    return Math.floor(Math.random() * 360);
  }

  private generateRandomPassword(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let output = '';

    for (let index = 0; index < length; index += 1) {
      output += chars[randomInt(0, chars.length)];
    }

    return output;
  }

  private async sendCredentialsEmailIfPossible(input: {
    email: string;
    fullName: string;
    password: string;
  }): Promise<void> {
    await this.notificationsService.notifyMemberCredentials({
      email: input.email,
      fullName: input.fullName,
      password: input.password,
    });
  }

  private getBcryptSaltRounds(): number {
    const rawValue = Number(
      this.configService.get<string>('BCRYPT_SALT_ROUNDS') ?? '12',
    );
    return Number.isNaN(rawValue) ? 12 : rawValue;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as { code?: string };
    return maybeError.code === '23505';
  }

  private isForeignKeyViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as { code?: string };
    return maybeError.code === '23503';
  }

  private getConstraintName(error: unknown): string | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const maybeError = error as { constraint?: string };
    return maybeError.constraint;
  }
}
