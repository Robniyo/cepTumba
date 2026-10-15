/**
 * FamiliesService
 *
 * Business rules implemented here:
 *   - Only the President may create / update / delete predefined families.
 *   - Only the VP-Social may trigger random assignment, manually move members,
 *     and select Daddy / Mummy parents per family.
 *   - Advisor-Social and President have read-only access.
 *   - A member belongs to AT MOST ONE family at a time (DB-enforced).
 *   - A family has AT MOST ONE Daddy (male) and ONE Mummy (female).
 *   - Random assignment uses a gender-balanced round-robin algorithm.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { AppRole } from '../auth/auth-role.type';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';
import { MoveMemberDto } from './dto/move-member.dto';
import { SelectParentsDto } from './dto/select-parents.dto';
import {
  AssignmentMode,
  RunAssignmentDto,
} from './dto/run-assignment.dto';

// ---------- Role policies ----------
const FAMILY_VIEWER_ROLES: AppRole[] = [
  'president',
  'vp_social',
  'advisor_social',
];
const FAMILY_CREATOR_ROLES: AppRole[] = ['president'];
const ASSIGNMENT_TRIGGER_ROLES: AppRole[] = ['vp_social'];
const PARENT_SELECTOR_ROLES: AppRole[] = ['vp_social'];

type Gender = 'male' | 'female' | 'other';
type MemberStatus = 'active' | 'inactive' | 'graduated' | 'suspended';
type FamilyStatus = 'active' | 'inactive';
type RoleInFamily = 'daddy' | 'mummy' | 'member';
type AssignmentMethod = 'random' | 'manual';

// ---------- DB row shapes ----------
type FamilyRow = {
  id: string;
  family_name: string;
  family_code: string;
  status: FamilyStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  id: string;
  family_id: string;
  member_id: string;
  role_in_family: RoleInFamily;
  assignment_method: AssignmentMethod;
  assignment_run_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
};

type EligibleMemberRow = {
  id: string;
  full_name: string;
  gender: Gender | null;
  member_no: string;
};

type AssignmentRunRow = {
  id: string;
  triggered_by: string | null;
  total_members_assigned: number;
  total_families: number;
  assignment_type: AssignmentMode;
  status: 'completed' | 'previewed' | 'failed';
  created_at: string;
};

// ---------- API response shapes ----------
export type FamilyMemberSummary = {
  membershipId: string;
  memberId: string;
  memberNo: string;
  fullName: string;
  gender: Gender | null;
  roleInFamily: RoleInFamily;
  yearOfStudy?: string | null;
  memberStatus?: MemberStatus;
};

export type FamilyResponse = {
  id: string;
  familyName: string;
  familyCode: string;
  status: FamilyStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  totalMembers: number;
  maleCount: number;
  femaleCount: number;
  otherCount: number;
  daddy: FamilyMemberSummary | null;
  mummy: FamilyMemberSummary | null;
};

export type FamilyDetailResponse = FamilyResponse & {
  members: FamilyMemberSummary[];
};

export type AssignmentPreviewFamily = {
  familyId: string;
  familyName: string;
  familyCode: string;
  members: Array<{
    memberId: string;
    memberNo: string;
    fullName: string;
    gender: Gender | null;
  }>;
  maleCount: number;
  femaleCount: number;
  total: number;
};

export type AssignmentRunSummary = {
  id: string;
  triggeredBy: string | null;
  totalMembersAssigned: number;
  totalFamilies: number;
  assignmentType: AssignmentMode;
  status: AssignmentRunRow['status'];
  createdAt: string;
};

export type AssignmentResult = {
  preview: boolean;
  mode: AssignmentMode;
  totalMembersAssigned: number;
  totalFamilies: number;
  unassignedCount: number;
  families: AssignmentPreviewFamily[];
  run: AssignmentRunSummary | null;
};

export type FamilyReportSummary = {
  totals: {
    totalFamilies: number;
    activeFamilies: number;
    inactiveFamilies: number;
    totalAssignedMembers: number;
    unassignedActiveMembers: number;
    familiesMissingDaddy: number;
    familiesMissingMummy: number;
  };
  perFamily: Array<{
    id: string;
    familyName: string;
    familyCode: string;
    totalMembers: number;
    maleCount: number;
    femaleCount: number;
    hasDaddy: boolean;
    hasMummy: boolean;
    balanced: boolean; // |male - female| <= 1
  }>;
  recentRuns: AssignmentRunSummary[];
};

@Injectable()
export class FamiliesService implements OnModuleInit {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  // ---------- Schema bootstrap ----------
  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'family_status') THEN
          CREATE TYPE family_status AS ENUM ('active','inactive');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_in_family') THEN
          CREATE TYPE role_in_family AS ENUM ('daddy','mummy','member');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_method') THEN
          CREATE TYPE assignment_method AS ENUM ('random','manual');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_run_type') THEN
          CREATE TYPE assignment_run_type AS ENUM ('unassigned_only','reassign_all');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_run_status') THEN
          CREATE TYPE assignment_run_status AS ENUM ('completed','previewed','failed');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS families (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        family_name text NOT NULL UNIQUE,
        family_code text NOT NULL UNIQUE,
        status family_status NOT NULL DEFAULT 'active',
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS family_assignment_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        triggered_by uuid REFERENCES users(id) ON DELETE SET NULL,
        total_members_assigned int NOT NULL DEFAULT 0,
        total_families int NOT NULL DEFAULT 0,
        assignment_type assignment_run_type NOT NULL,
        status assignment_run_status NOT NULL DEFAULT 'completed',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS family_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
        member_id uuid NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
        role_in_family role_in_family NOT NULL DEFAULT 'member',
        assignment_method assignment_method NOT NULL DEFAULT 'random',
        assignment_run_id uuid REFERENCES family_assignment_runs(id) ON DELETE SET NULL,
        assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
        assigned_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Enforce at most one daddy and one mummy per family
    await this.databaseService.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS family_memberships_one_daddy_idx
      ON family_memberships (family_id)
      WHERE role_in_family = 'daddy'
    `);
    await this.databaseService.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS family_memberships_one_mummy_idx
      ON family_memberships (family_id)
      WHERE role_in_family = 'mummy'
    `);
    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS family_memberships_family_idx
      ON family_memberships (family_id)
    `);
  }

  // ---------- Helpers ----------
  private requireRole(actual: AppRole, allowed: AppRole[], action: string): void {
    if (!allowed.includes(actual)) {
      throw new ForbiddenException(`You are not authorized to ${action}`);
    }
  }

  private mapRunRow(row: AssignmentRunRow): AssignmentRunSummary {
    return {
      id: row.id,
      triggeredBy: row.triggered_by,
      totalMembersAssigned: row.total_members_assigned,
      totalFamilies: row.total_families,
      assignmentType: row.assignment_type,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  // Seeded shuffle is unnecessary; cryptographic-strength is also not required.
  // A standard Fisher-Yates with Math.random is sufficient and fair for this domain.
  private shuffle<T>(items: T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // ---------- Read endpoints ----------
  async listFamilies(requesterRole: AppRole): Promise<FamilyResponse[]> {
    this.requireRole(requesterRole, FAMILY_VIEWER_ROLES, 'view families');
    const result = await this.databaseService.query<FamilyRow & {
      total_members: string;
      male_count: string;
      female_count: string;
      other_count: string;
      daddy_member_id: string | null;
      daddy_full_name: string | null;
      daddy_member_no: string | null;
      daddy_membership_id: string | null;
      mummy_member_id: string | null;
      mummy_full_name: string | null;
      mummy_member_no: string | null;
      mummy_membership_id: string | null;
    }>(`
      SELECT
        f.id, f.family_name, f.family_code, f.status::text AS status,
        f.created_by, f.created_at, f.updated_at,
        COALESCE(stats.total_members, 0) AS total_members,
        COALESCE(stats.male_count, 0) AS male_count,
        COALESCE(stats.female_count, 0) AS female_count,
        COALESCE(stats.other_count, 0) AS other_count,
        d.member_id AS daddy_member_id,
        dm.full_name AS daddy_full_name,
        dm.member_no AS daddy_member_no,
        d.id AS daddy_membership_id,
        m.member_id AS mummy_member_id,
        mm.full_name AS mummy_full_name,
        mm.member_no AS mummy_member_no,
        m.id AS mummy_membership_id
      FROM families f
      LEFT JOIN (
        SELECT
          fm.family_id,
          COUNT(*) AS total_members,
          COUNT(*) FILTER (WHERE mem.gender = 'male') AS male_count,
          COUNT(*) FILTER (WHERE mem.gender = 'female') AS female_count,
          COUNT(*) FILTER (WHERE mem.gender IS NULL OR mem.gender = 'other') AS other_count
        FROM family_memberships fm
        JOIN members mem ON mem.id = fm.member_id
        GROUP BY fm.family_id
      ) stats ON stats.family_id = f.id
      LEFT JOIN family_memberships d ON d.family_id = f.id AND d.role_in_family = 'daddy'
      LEFT JOIN members dm ON dm.id = d.member_id
      LEFT JOIN family_memberships m ON m.family_id = f.id AND m.role_in_family = 'mummy'
      LEFT JOIN members mm ON mm.id = m.member_id
      ORDER BY f.family_name ASC
    `);

    return result.rows.map((r) => ({
      id: r.id,
      familyName: r.family_name,
      familyCode: r.family_code,
      status: r.status,
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      totalMembers: Number(r.total_members),
      maleCount: Number(r.male_count),
      femaleCount: Number(r.female_count),
      otherCount: Number(r.other_count),
      daddy: r.daddy_member_id
        ? {
            membershipId: r.daddy_membership_id ?? '',
            memberId: r.daddy_member_id,
            memberNo: r.daddy_member_no ?? '',
            fullName: r.daddy_full_name ?? '',
            gender: 'male',
            roleInFamily: 'daddy',
          }
        : null,
      mummy: r.mummy_member_id
        ? {
            membershipId: r.mummy_membership_id ?? '',
            memberId: r.mummy_member_id,
            memberNo: r.mummy_member_no ?? '',
            fullName: r.mummy_full_name ?? '',
            gender: 'female',
            roleInFamily: 'mummy',
          }
        : null,
    }));
  }

  async getFamily(
    familyId: string,
    requesterRole: AppRole,
  ): Promise<FamilyDetailResponse> {
    this.requireRole(requesterRole, FAMILY_VIEWER_ROLES, 'view families');
    const list = await this.listFamilies(requesterRole);
    const family = list.find((f) => f.id === familyId);
    if (!family) throw new NotFoundException('Family not found');

    const membersResult = await this.databaseService.query<{
      membership_id: string;
      member_id: string;
      member_no: string;
      full_name: string;
      gender: Gender | null;
      role_in_family: RoleInFamily;
      year_of_study: string | null;
      member_status: MemberStatus;
    }>(
      `
      SELECT fm.id AS membership_id, fm.member_id, m.member_no, m.full_name,
             m.gender::text AS gender, fm.role_in_family::text AS role_in_family,
             m.year_of_study AS year_of_study, m.status::text AS member_status
      FROM family_memberships fm
      JOIN members m ON m.id = fm.member_id
      WHERE fm.family_id = $1
      ORDER BY
        CASE fm.role_in_family WHEN 'daddy' THEN 1 WHEN 'mummy' THEN 2 ELSE 3 END,
        m.full_name ASC
      `,
      [familyId],
    );

    return {
      ...family,
      members: membersResult.rows.map((r) => ({
        membershipId: r.membership_id,
        memberId: r.member_id,
        memberNo: r.member_no,
        fullName: r.full_name,
        gender: r.gender,
        roleInFamily: r.role_in_family,
        yearOfStudy: r.year_of_study,
        memberStatus: r.member_status,
      })),
    };
  }

  // ---------- Family CRUD (President only) ----------
  /**
   * Derive a clean uppercase family code from a free-form family name.
   * Strips diacritics, keeps `[A-Z0-9]`, trims to 12 chars, and returns
   * `FAM` if nothing usable remains.
   */
  private slugifyFamilyCode(name: string): string {
    const cleaned = name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-+/g, '-')
      .slice(0, 12);
    return cleaned.length >= 2 ? cleaned : 'FAM';
  }

  /**
   * Returns a unique family code. If `requested` is given, it's used as-is
   * (the DB unique constraint will surface duplicates). Otherwise a code is
   * derived from `name` and disambiguated with `-2`, `-3`, … until free.
   */
  private async resolveFamilyCode(
    requested: string | undefined,
    name: string,
  ): Promise<string> {
    if (requested && requested.trim().length > 0) {
      return requested.trim().toUpperCase();
    }
    const base = this.slugifyFamilyCode(name);
    // Try the base first, then append `-2`, `-3`, ... until unused.
    for (let suffix = 0; suffix < 100; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`.slice(0, 16);
      const result = await this.databaseService.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM families WHERE family_code = $1) AS exists`,
        [candidate],
      );
      if (!result.rows[0]?.exists) return candidate;
    }
    // Extreme fallback — should never realistically happen.
    return `${base}-${Date.now().toString(36).toUpperCase()}`.slice(0, 16);
  }

  async createFamily(
    dto: CreateFamilyDto,
    requesterRole: AppRole,
    requesterUserId: string,
  ): Promise<FamilyResponse> {
    this.requireRole(requesterRole, FAMILY_CREATOR_ROLES, 'create families');
    const familyName = dto.familyName.trim();
    const familyCode = await this.resolveFamilyCode(dto.familyCode, familyName);
    try {
      await this.databaseService.query(
        `INSERT INTO families (family_name, family_code, status, created_by)
         VALUES ($1, $2, $3::family_status, $4)`,
        [familyName, familyCode, dto.status ?? 'active', requesterUserId],
      );
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      if (e.code === '23505') {
        if (e.constraint === 'families_family_name_key') {
          throw new ConflictException('A family with this name already exists');
        }
        if (e.constraint === 'families_family_code_key') {
          throw new ConflictException('A family with this code already exists');
        }
        throw new ConflictException('Duplicate family');
      }
      throw error;
    }

    this.activityLogService.logSystem({
      action: 'FAMILY_CREATE',
      metadata: { name: familyName, code: familyCode, by: requesterUserId },
    });
    const list = await this.listFamilies(requesterRole);
    const created = list.find((f) => f.familyCode === familyCode);
    if (!created) throw new NotFoundException('Family not found after create');
    return created;
  }

  async updateFamily(
    familyId: string,
    dto: UpdateFamilyDto,
    requesterRole: AppRole,
  ): Promise<FamilyResponse> {
    this.requireRole(requesterRole, FAMILY_CREATOR_ROLES, 'update families');
    try {
      const result = await this.databaseService.query<{ id: string }>(
        `
        UPDATE families
        SET family_name = COALESCE($2, family_name),
            family_code = COALESCE($3, family_code),
            status      = COALESCE($4::family_status, status),
            updated_at  = now()
        WHERE id = $1
        RETURNING id
        `,
        [
          familyId,
          dto.familyName?.trim() ?? null,
          dto.familyCode?.trim().toUpperCase() ?? null,
          dto.status ?? null,
        ],
      );
      if (result.rowCount === 0) throw new NotFoundException('Family not found');
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      if (e.code === '23505') {
        throw new ConflictException('A family with this name or code already exists');
      }
      throw error;
    }
    return this.getFamily(familyId, requesterRole);
  }

  async deleteFamily(familyId: string, requesterRole: AppRole): Promise<void> {
    this.requireRole(requesterRole, FAMILY_CREATOR_ROLES, 'delete families');
    const has = await this.databaseService.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM family_memberships WHERE family_id = $1`,
      [familyId],
    );
    if (Number(has.rows[0]?.count ?? '0') > 0) {
      throw new ConflictException(
        'Cannot delete a family that still has assigned members. Reassign or remove them first.',
      );
    }
    const result = await this.databaseService.query(
      `DELETE FROM families WHERE id = $1`,
      [familyId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Family not found');
  }

  // ---------- Assignment ----------
  /**
   * Build a gender-balanced random distribution of members across the given families.
   *
   * Algorithm:
   *   1. Split members by gender into male / female / other pools.
   *   2. Shuffle each pool independently.
   *   3. Round-robin distribute the male pool across families starting at index 0.
   *   4. Round-robin distribute the female pool starting at the next index after the
   *      last placed male — this offset rotation interleaves genders across families
   *      so the family that "absorbed" an extra male is unlikely to also absorb
   *      an extra female.
   *   5. Round-robin distribute the "other" pool last with another rotation.
   *
   * For 3 families and 7 males → 3, 2, 2.   For 3 families and 5 females offset by 7
   * → starts at family index `7 % 3 = 1` → 1, 2, 2.  Net per-family totals are
   * balanced and gender splits are as even as possible.
   */
  private buildAssignment(
    families: FamilyRow[],
    members: EligibleMemberRow[],
  ): Map<string, EligibleMemberRow[]> {
    const buckets = new Map<string, EligibleMemberRow[]>();
    for (const f of families) buckets.set(f.id, []);
    if (families.length === 0) return buckets;

    const males = this.shuffle(members.filter((m) => m.gender === 'male'));
    const females = this.shuffle(members.filter((m) => m.gender === 'female'));
    const others = this.shuffle(
      members.filter((m) => m.gender !== 'male' && m.gender !== 'female'),
    );

    const distribute = (
      pool: EligibleMemberRow[],
      startIndex: number,
    ): number => {
      pool.forEach((member, idx) => {
        const targetIdx = (startIndex + idx) % families.length;
        const familyId = families[targetIdx].id;
        buckets.get(familyId)!.push(member);
      });
      return startIndex + pool.length;
    };

    let cursor = 0;
    cursor = distribute(males, cursor);
    cursor = distribute(females, cursor);
    distribute(others, cursor);
    return buckets;
  }

  async runAssignment(
    dto: RunAssignmentDto,
    requesterRole: AppRole,
    requesterUserId: string,
  ): Promise<AssignmentResult> {
    this.requireRole(requesterRole, ASSIGNMENT_TRIGGER_ROLES, 'run family assignment');
    const isPreview = dto.preview === true;

    return this.databaseService.withTransaction<AssignmentResult>(
      async (client: PoolClient) => {
        // Lock active families
        const familiesResult = await client.query<FamilyRow>(
          `SELECT id, family_name, family_code, status::text AS status,
                  created_by, created_at, updated_at
           FROM families
           WHERE status = 'active'
           ORDER BY family_name ASC
           FOR UPDATE`,
        );
        const families = familiesResult.rows;
        if (families.length === 0) {
          throw new BadRequestException(
            'No active families exist. Ask the President to create families first.',
          );
        }

        // Determine eligible member set
        const wherePieces: string[] = [`m.status = 'active'`];
        if (dto.mode === 'unassigned_only') {
          wherePieces.push(
            `NOT EXISTS (SELECT 1 FROM family_memberships fm WHERE fm.member_id = m.id)`,
          );
        }
        const membersResult = await client.query<EligibleMemberRow>(
          `SELECT m.id, m.full_name, m.gender::text AS gender, m.member_no
           FROM members m
           WHERE ${wherePieces.join(' AND ')}`,
        );
        const members = membersResult.rows;

        if (members.length === 0) {
          // Nothing to do — but still record the run for traceability when not previewing.
          const runRow = !isPreview
            ? await this.insertRun(client, {
                triggeredBy: requesterUserId,
                totalMembersAssigned: 0,
                totalFamilies: families.length,
                assignmentType: dto.mode,
                status: 'completed',
              })
            : null;
          return {
            preview: isPreview,
            mode: dto.mode,
            totalMembersAssigned: 0,
            totalFamilies: families.length,
            unassignedCount: 0,
            families: families.map((f) => ({
              familyId: f.id,
              familyName: f.family_name,
              familyCode: f.family_code,
              members: [],
              maleCount: 0,
              femaleCount: 0,
              total: 0,
            })),
            run: runRow ? this.mapRunRow(runRow) : null,
          };
        }

        const buckets = this.buildAssignment(families, members);

        if (!isPreview) {
          // Persist
          if (dto.mode === 'reassign_all') {
            await client.query(`DELETE FROM family_memberships`);
          }

          const run = await this.insertRun(client, {
            triggeredBy: requesterUserId,
            totalMembersAssigned: members.length,
            totalFamilies: families.length,
            assignmentType: dto.mode,
            status: 'completed',
          });

          for (const family of families) {
            const list = buckets.get(family.id) ?? [];
            for (const member of list) {
              await client.query(
                `INSERT INTO family_memberships
                   (family_id, member_id, role_in_family, assignment_method, assignment_run_id, assigned_by)
                 VALUES ($1, $2, 'member', 'random', $3, $4)
                 ON CONFLICT (member_id) DO UPDATE
                   SET family_id = EXCLUDED.family_id,
                       role_in_family = 'member',
                       assignment_method = 'random',
                       assignment_run_id = EXCLUDED.assignment_run_id,
                       assigned_by = EXCLUDED.assigned_by,
                       assigned_at = now(),
                       updated_at = now()`,
                [family.id, member.id, run.id, requesterUserId],
              );
            }
          }

          this.activityLogService.logSystem({
            action: 'FAMILY_ASSIGNMENT_RUN',
            metadata: {
              run_id: run.id,
              mode: dto.mode,
              total_members: members.length,
              total_families: families.length,
            },
          });

          // Count members still without a family (only meaningful in unassigned_only mode)
          const unassigned = await client.query<{ count: string }>(
            `SELECT COUNT(*)::text AS count
             FROM members m
             WHERE m.status = 'active'
               AND NOT EXISTS (SELECT 1 FROM family_memberships fm WHERE fm.member_id = m.id)`,
          );

          return {
            preview: false,
            mode: dto.mode,
            totalMembersAssigned: members.length,
            totalFamilies: families.length,
            unassignedCount: Number(unassigned.rows[0]?.count ?? '0'),
            families: this.bucketsToPreview(families, buckets),
            run: this.mapRunRow(run),
          };
        }

        return {
          preview: true,
          mode: dto.mode,
          totalMembersAssigned: members.length,
          totalFamilies: families.length,
          unassignedCount: 0,
          families: this.bucketsToPreview(families, buckets),
          run: null,
        };
      },
    );
  }

  private bucketsToPreview(
    families: FamilyRow[],
    buckets: Map<string, EligibleMemberRow[]>,
  ): AssignmentPreviewFamily[] {
    return families.map((f) => {
      const list = buckets.get(f.id) ?? [];
      return {
        familyId: f.id,
        familyName: f.family_name,
        familyCode: f.family_code,
        members: list.map((m) => ({
          memberId: m.id,
          memberNo: m.member_no,
          fullName: m.full_name,
          gender: m.gender,
        })),
        maleCount: list.filter((m) => m.gender === 'male').length,
        femaleCount: list.filter((m) => m.gender === 'female').length,
        total: list.length,
      };
    });
  }

  private async insertRun(
    client: PoolClient,
    input: {
      triggeredBy: string;
      totalMembersAssigned: number;
      totalFamilies: number;
      assignmentType: AssignmentMode;
      status: AssignmentRunRow['status'];
    },
  ): Promise<AssignmentRunRow> {
    const result = await client.query<AssignmentRunRow>(
      `INSERT INTO family_assignment_runs
         (triggered_by, total_members_assigned, total_families, assignment_type, status)
       VALUES ($1, $2, $3, $4::assignment_run_type, $5::assignment_run_status)
       RETURNING id, triggered_by, total_members_assigned, total_families,
                 assignment_type::text AS assignment_type,
                 status::text AS status, created_at`,
      [
        input.triggeredBy,
        input.totalMembersAssigned,
        input.totalFamilies,
        input.assignmentType,
        input.status,
      ],
    );
    return result.rows[0];
  }

  async listAssignmentRuns(
    requesterRole: AppRole,
  ): Promise<AssignmentRunSummary[]> {
    this.requireRole(requesterRole, FAMILY_VIEWER_ROLES, 'view assignment runs');
    const result = await this.databaseService.query<AssignmentRunRow>(
      `SELECT id, triggered_by, total_members_assigned, total_families,
              assignment_type::text AS assignment_type,
              status::text AS status, created_at
       FROM family_assignment_runs
       ORDER BY created_at DESC
       LIMIT 50`,
    );
    return result.rows.map((r) => this.mapRunRow(r));
  }

  // ---------- Manual member move (VP-Social) ----------
  async moveMember(
    dto: MoveMemberDto,
    requesterRole: AppRole,
    requesterUserId: string,
  ): Promise<FamilyDetailResponse> {
    this.requireRole(requesterRole, ASSIGNMENT_TRIGGER_ROLES, 'move family members');
    return this.databaseService.withTransaction<FamilyDetailResponse>(
      async (client: PoolClient) => {
        // Confirm target family is active
        const target = await client.query<{ status: FamilyStatus }>(
          `SELECT status::text AS status FROM families WHERE id = $1 LIMIT 1`,
          [dto.targetFamilyId],
        );
        if (target.rowCount === 0) {
          throw new NotFoundException('Target family not found');
        }
        if (target.rows[0].status !== 'active') {
          throw new BadRequestException('Target family is not active');
        }
        // Confirm member is active
        const memberExists = await client.query<{ status: string }>(
          `SELECT status::text AS status FROM members WHERE id = $1 LIMIT 1`,
          [dto.memberId],
        );
        if (memberExists.rowCount === 0) {
          throw new NotFoundException('Member not found');
        }
        if (memberExists.rows[0].status !== 'active') {
          throw new BadRequestException('Only active members can be moved');
        }

        // Upsert the membership and reset role to plain 'member' (parents
        // would need to be re-selected by VP-Social on the new family).
        await client.query(
          `INSERT INTO family_memberships
             (family_id, member_id, role_in_family, assignment_method, assigned_by)
           VALUES ($1, $2, 'member', 'manual', $3)
           ON CONFLICT (member_id) DO UPDATE
             SET family_id = EXCLUDED.family_id,
                 role_in_family = 'member',
                 assignment_method = 'manual',
                 assigned_by = EXCLUDED.assigned_by,
                 assigned_at = now(),
                 updated_at = now()`,
          [dto.targetFamilyId, dto.memberId, requesterUserId],
        );

        this.activityLogService.logSystem({
          action: 'FAMILY_MEMBER_MOVE',
          metadata: { member_id: dto.memberId, target_family_id: dto.targetFamilyId },
        });
        return this.getFamily(dto.targetFamilyId, requesterRole);
      },
    );
  }

  // ---------- Parent selection (VP-Social) ----------
  async selectParents(
    familyId: string,
    dto: SelectParentsDto,
    requesterRole: AppRole,
  ): Promise<FamilyDetailResponse> {
    this.requireRole(requesterRole, PARENT_SELECTOR_ROLES, 'select family parents');
    if (dto.daddyMemberId === undefined && dto.mummyMemberId === undefined) {
      throw new BadRequestException(
        'Provide daddyMemberId and/or mummyMemberId (use null to clear).',
      );
    }

    return this.databaseService.withTransaction<FamilyDetailResponse>(
      async (client: PoolClient) => {
        // Family must exist
        const family = await client.query<{ id: string }>(
          `SELECT id FROM families WHERE id = $1 LIMIT 1`,
          [familyId],
        );
        if (family.rowCount === 0) {
          throw new NotFoundException('Family not found');
        }

        // Helper to set a single parent role
        const setParent = async (
          role: 'daddy' | 'mummy',
          requiredGender: 'male' | 'female',
          memberId: string | null | undefined,
        ): Promise<void> => {
          if (memberId === undefined) return; // not modifying this slot

          // First clear whoever currently holds this parent role
          await client.query(
            `UPDATE family_memberships
             SET role_in_family = 'member', updated_at = now()
             WHERE family_id = $1 AND role_in_family = $2::role_in_family`,
            [familyId, role],
          );

          if (memberId === null) {
            return; // caller asked to clear this slot
          }

          // The new parent must be: in this family, active, and the right gender
          const candidate = await client.query<{
            membership_id: string;
            gender: Gender | null;
            status: string;
          }>(
            `SELECT fm.id AS membership_id, m.gender::text AS gender, m.status::text AS status
             FROM family_memberships fm
             JOIN members m ON m.id = fm.member_id
             WHERE fm.family_id = $1 AND fm.member_id = $2
             LIMIT 1`,
            [familyId, memberId],
          );
          if (candidate.rowCount === 0) {
            throw new BadRequestException(
              `${role === 'daddy' ? 'Daddy' : 'Mummy'} must be a member of this family`,
            );
          }
          const row = candidate.rows[0];
          if (row.status !== 'active') {
            throw new BadRequestException(
              `${role === 'daddy' ? 'Daddy' : 'Mummy'} must be an active member`,
            );
          }
          if (row.gender !== requiredGender) {
            throw new BadRequestException(
              role === 'daddy'
                ? 'Daddy must be a male member'
                : 'Mummy must be a female member',
            );
          }

          await client.query(
            `UPDATE family_memberships
             SET role_in_family = $2::role_in_family, updated_at = now()
             WHERE id = $1`,
            [row.membership_id, role],
          );
        };

        await setParent('daddy', 'male', dto.daddyMemberId);
        await setParent('mummy', 'female', dto.mummyMemberId);

        this.activityLogService.logSystem({
          action: 'FAMILY_PARENTS_SELECT',
          metadata: {
            family_id: familyId,
            daddy: dto.daddyMemberId ?? null,
            mummy: dto.mummyMemberId ?? null,
          },
        });
        return this.getFamily(familyId, requesterRole);
      },
    );
  }

  // ---------- "My family" (any authenticated user) ----------
  /**
   * Returns the family the current user belongs to, plus its full member list
   * so members can see their fellow brothers and sisters. Returns `null` if
   * the user has no linked member record or has not been assigned to a family.
   */
  async getMyFamily(userId: string): Promise<FamilyDetailResponse | null> {
    const lookup = await this.databaseService.query<{ family_id: string | null }>(
      `
      SELECT fm.family_id AS family_id
      FROM users u
      LEFT JOIN family_memberships fm ON fm.member_id = u.member_id
      WHERE u.id = $1
      LIMIT 1
      `,
      [userId],
    );
    const familyId = lookup.rows[0]?.family_id;
    if (!familyId) return null;

    // Reuse the privileged loader, but bypass the role check by going directly
    // through the underlying query — this endpoint is intentionally open to
    // any authenticated user for their OWN family only.
    const list = await this.listFamiliesInternal();
    const family = list.find((f) => f.id === familyId);
    if (!family) return null;

    const membersResult = await this.databaseService.query<{
      membership_id: string;
      member_id: string;
      member_no: string;
      full_name: string;
      gender: Gender | null;
      role_in_family: RoleInFamily;
      year_of_study: string | null;
      member_status: MemberStatus;
    }>(
      `
      SELECT fm.id AS membership_id, fm.member_id, m.member_no, m.full_name,
             m.gender::text AS gender, fm.role_in_family::text AS role_in_family,
             m.year_of_study AS year_of_study, m.status::text AS member_status
      FROM family_memberships fm
      JOIN members m ON m.id = fm.member_id
      WHERE fm.family_id = $1
      ORDER BY
        CASE fm.role_in_family WHEN 'daddy' THEN 1 WHEN 'mummy' THEN 2 ELSE 3 END,
        m.full_name ASC
      `,
      [familyId],
    );

    return {
      ...family,
      members: membersResult.rows.map((r) => ({
        membershipId: r.membership_id,
        memberId: r.member_id,
        memberNo: r.member_no,
        fullName: r.full_name,
        gender: r.gender,
        roleInFamily: r.role_in_family,
        yearOfStudy: r.year_of_study,
        memberStatus: r.member_status,
      })),
    };
  }

  /**
   * Same SQL as `listFamilies` but skips the role check. Reserved for callers
   * that already enforce their own access policy (e.g. `getMyFamily`).
   */
  private async listFamiliesInternal(): Promise<FamilyResponse[]> {
    return this.listFamilies('president');
  }

  // ---------- Reports ----------
  async getReportSummary(
    requesterRole: AppRole,
  ): Promise<FamilyReportSummary> {
    this.requireRole(requesterRole, FAMILY_VIEWER_ROLES, 'view family reports');
    const families = await this.listFamilies(requesterRole);

    const unassignedActive = await this.databaseService.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM members m
       WHERE m.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM family_memberships fm WHERE fm.member_id = m.id)`,
    );

    const recentRuns = await this.listAssignmentRuns(requesterRole);

    return {
      totals: {
        totalFamilies: families.length,
        activeFamilies: families.filter((f) => f.status === 'active').length,
        inactiveFamilies: families.filter((f) => f.status === 'inactive').length,
        totalAssignedMembers: families.reduce((sum, f) => sum + f.totalMembers, 0),
        unassignedActiveMembers: Number(unassignedActive.rows[0]?.count ?? '0'),
        familiesMissingDaddy: families.filter(
          (f) => f.status === 'active' && !f.daddy && f.totalMembers > 0,
        ).length,
        familiesMissingMummy: families.filter(
          (f) => f.status === 'active' && !f.mummy && f.totalMembers > 0,
        ).length,
      },
      perFamily: families.map((f) => ({
        id: f.id,
        familyName: f.familyName,
        familyCode: f.familyCode,
        totalMembers: f.totalMembers,
        maleCount: f.maleCount,
        femaleCount: f.femaleCount,
        hasDaddy: !!f.daddy,
        hasMummy: !!f.mummy,
        balanced: Math.abs(f.maleCount - f.femaleCount) <= 1,
      })),
      recentRuns: recentRuns.slice(0, 10),
    };
  }
}
