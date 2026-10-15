import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AppRole } from '../auth/auth-role.type';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { CreateSavingsWithdrawalRequestDto } from './dto/create-savings-withdrawal-request.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';
import { RequestStatus, RequestType } from './request.types';

// Review permissions per request type
const REVIEW_ROLES_BY_TYPE: Record<RequestType, AppRole[]> = {
  prayer_support: ['president', 'vp_prayers', 'advisor_prayers'],
  financial_aid: ['president', 'accountant'],
  welfare_help: ['president', 'vp_social', 'advisor_social'],
  budget_request: ['president', 'accountant'],
  event_approval: ['president', 'secretary', 'vp_prayers', 'vp_social'],
  reimbursement: ['president', 'accountant'],
  leader_apology: ['president', 'secretary'],
  savings_withdrawal: ['president', 'accountant'],
};

const ANY_REVIEWER_ROLES: AppRole[] = [
  'president',
  'secretary',
  'vp_prayers',
  'vp_social',
  'advisor_prayers',
  'advisor_social',
  'accountant',
];

type RequestRow = {
  id: string;
  type: RequestType;
  title: string;
  description: string;
  requester_user_id: string | null;
  requester_name: string;
  requester_role: string;
  member_id: string | null;
  amount: string | null;
  member_savings_balance_rwf: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export type RequestResponse = {
  id: string;
  type: RequestType;
  title: string;
  description: string;
  requesterUserId: string | null;
  requesterName: string;
  requesterRole: string;
  memberId: string | null;
  amount: number | null;
  memberSavingsBalanceRwf: number | null;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class RequestsService implements OnModuleInit {
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

  async listRequests(
    currentUser: { sub: string; role: AppRole },
  ): Promise<RequestResponse[]> {
    const isReviewer = ANY_REVIEWER_ROLES.includes(currentUser.role);

    const result = await this.databaseService.query<RequestRow>(
      `
      SELECT id, type::text AS type, title, description, requester_user_id,
             requester_name, requester_role, member_id, amount, member_savings_balance_rwf,
             status::text AS status, reviewed_by, review_note, created_at, updated_at
      FROM association_requests
      WHERE $1::boolean = true OR requester_user_id = $2
      ORDER BY created_at DESC
      `,
      [isReviewer, currentUser.sub],
    );
    return result.rows.map((r) => this.map(r));
  }

  async createRequest(
    dto: CreateRequestDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<RequestResponse> {
    const requesterName =
      dto.requesterName?.trim() ||
      (await this.resolveDisplayName(currentUser.sub, currentUser.email));
    const requesterRole = dto.requesterRole?.trim() || currentUser.role;

    const result = await this.databaseService.query<RequestRow>(
      `
      INSERT INTO association_requests (
        type, title, description, requester_user_id, requester_name, requester_role,
        amount, status
      ) VALUES ($1::request_type, $2, $3, $4, $5, $6, $7, 'pending'::request_status)
      RETURNING id, type::text AS type, title, description, requester_user_id,
                requester_name, requester_role, amount, status::text AS status,
                reviewed_by, review_note, created_at, updated_at
      `,
      [
        dto.type,
        dto.title.trim(),
        dto.description.trim(),
        currentUser.sub,
        requesterName,
        requesterRole,
        dto.amount ?? null,
      ],
    );

    this.activityLogService.logSystem({
      action: `REQUEST_CREATE: ${result.rows[0].id}`,
      metadata: {
        request_id: result.rows[0].id,
        type: dto.type,
        requester_id: currentUser.sub,
      },
    });

    const created = this.map(result.rows[0]);
    this.dispatchNotificationSafely(
      this.notificationsService.notifyRequestSubmitted({
        requestId: created.id,
        type: created.type,
        title: created.title,
        requesterName: created.requesterName,
        requesterRole: created.requesterRole,
        reviewerRoles: REVIEW_ROLES_BY_TYPE[created.type] ?? [],
      }),
      'REQUEST_NOTIFY_FAILED',
      { request_id: created.id, stage: 'submitted' },
    );
    return created;
  }

  async createSavingsWithdrawalRequest(
    dto: CreateSavingsWithdrawalRequestDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<RequestResponse> {
    // Get member info and current savings balance
    const memberResult = await this.databaseService.query<{
      full_name: string;
      phone: string | null;
      email: string | null;
    }>(
      `SELECT full_name, phone, email FROM members WHERE id = $1 LIMIT 1`,
      [dto.memberId],
    );

    if (memberResult.rowCount === 0) {
      throw new NotFoundException('Member not found');
    }

    const member = memberResult.rows[0];

    // Calculate current savings balance from finance_transactions
    const balanceResult = await this.databaseService.query<{ balance: string }>(
      `
      SELECT COALESCE(SUM(CASE 
        WHEN direction = 'in' THEN amount_rwf 
        WHEN direction = 'out' THEN -amount_rwf 
      END), 0) AS balance
      FROM finance_transactions
      WHERE member_id = $1 AND fund_id = 'savings'::finance_fund_id AND status = 'approved'::finance_tx_status
      `,
      [dto.memberId],
    );

    const currentBalance = balanceResult.rows[0] ? Number(balanceResult.rows[0].balance) : 0;

    // Create the request
    const result = await this.databaseService.query<RequestRow>(
      `
      INSERT INTO association_requests (
        type, title, description, requester_user_id, requester_name, requester_role,
        member_id, amount, member_savings_balance_rwf, status
      ) VALUES (
        'savings_withdrawal'::association_request_type,
        $1, $2, $3, $4, $5, $6, $7, $8, 'pending'::association_request_status
      )
      RETURNING id, type::text AS type, title, description, requester_user_id,
                requester_name, requester_role, member_id, amount, member_savings_balance_rwf,
                status::text AS status, reviewed_by, review_note, created_at, updated_at
      `,
      [
        `Savings Withdrawal Request - ${member.full_name}`,
        `Reason: ${dto.reason}${dto.additionalDetails ? '\n\n' + dto.additionalDetails : ''}`,
        currentUser.sub,
        member.full_name,
        currentUser.role,
        dto.memberId,
        dto.amount,
        currentBalance,
      ],
    );

    this.activityLogService.logSystem({
      action: `SAVINGS_WITHDRAWAL_REQUEST_CREATE: ${result.rows[0].id}`,
      metadata: {
        request_id: result.rows[0].id,
        member_id: dto.memberId,
        amount: dto.amount,
        current_balance: currentBalance,
        requester_id: currentUser.sub,
      },
    });

    const created = this.map(result.rows[0]);
    this.dispatchNotificationSafely(
      this.notificationsService.notifyRequestSubmitted({
        requestId: created.id,
        type: created.type,
        title: created.title,
        requesterName: created.requesterName,
        requesterRole: created.requesterRole,
        reviewerRoles: REVIEW_ROLES_BY_TYPE[created.type] ?? [],
      }),
      'REQUEST_NOTIFY_FAILED',
      { request_id: created.id, stage: 'submitted' },
    );
    return created;
  }

  async updateStatus(
    id: string,
    dto: UpdateRequestStatusDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<RequestResponse> {
    const existing = await this.databaseService.query<{ type: RequestType }>(
      `SELECT type::text AS type FROM association_requests WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (existing.rowCount === 0) {
      throw new NotFoundException('Request not found');
    }

    const allowedRoles = REVIEW_ROLES_BY_TYPE[existing.rows[0].type] ?? [];
    if (!allowedRoles.includes(currentUser.role)) {
      throw new ForbiddenException(
        'You are not authorized to review this type of request',
      );
    }

    const reviewer = await this.resolveDisplayName(currentUser.sub, currentUser.email);

    const result = await this.databaseService.query<RequestRow>(
      `
      UPDATE association_requests SET
        status = $2::request_status,
        reviewed_by = $3,
        review_note = COALESCE($4, review_note),
        updated_at = now()
      WHERE id = $1
      RETURNING id, type::text AS type, title, description, requester_user_id,
                requester_name, requester_role, member_id, amount, member_savings_balance_rwf,
                status::text AS status, reviewed_by, review_note, created_at, updated_at
      `,
      [id, dto.status, reviewer, dto.reviewNote ?? null],
    );

    this.activityLogService.logSystem({
      action: `REQUEST_STATUS: ${id}`,
      metadata: {
        request_id: id,
        new_status: dto.status,
        reviewer_role: currentUser.role,
      },
    });

    const updated = this.map(result.rows[0]);
    const requesterEmail = await this.resolveUserEmail(updated.requesterUserId);
    this.dispatchNotificationSafely(
      this.notificationsService.notifyRequestStatusChanged({
        requestId: updated.id,
        title: updated.title,
        status: updated.status,
        reviewerName: reviewer,
        reviewNote: updated.reviewNote,
        requesterUserId: updated.requesterUserId,
        requesterEmail,
        requesterName: updated.requesterName,
      }),
      'REQUEST_NOTIFY_FAILED',
      { request_id: updated.id, stage: 'status_change' },
    );
    return updated;
  }

  private async resolveUserEmail(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const result = await this.databaseService.query<{ email: string | null }>(
      `SELECT email FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return result.rows[0]?.email ?? null;
  }

  async deleteRequest(
    id: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ deletedRequestId: string }> {
    const isPresident = currentUser.role === 'president';
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM association_requests
       WHERE id = $1 AND ($2::boolean OR (requester_user_id = $3 AND status = 'pending'::request_status))
       RETURNING id`,
      [id, isPresident, currentUser.sub],
    );
    if (result.rowCount === 0) {
      throw new ForbiddenException('Cannot delete this request');
    }
    return { deletedRequestId: id };
  }

  private async resolveDisplayName(userId: string, fallbackEmail: string) {
    const result = await this.databaseService.query<{
      display_name: string | null;
      email: string | null;
    }>(`SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (row?.display_name?.trim()) return row.display_name.trim();
    if (row?.email?.trim()) return row.email.trim();
    return fallbackEmail || 'User';
  }

  private map(row: RequestRow): RequestResponse {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      requesterUserId: row.requester_user_id,
      requesterName: row.requester_name,
      requesterRole: row.requester_role,
      memberId: row.member_id,
      amount: row.amount === null ? null : Number(row.amount),
      memberSavingsBalanceRwf: row.member_savings_balance_rwf === null ? null : Number(row.member_savings_balance_rwf),
      status: row.status,
      reviewedBy: row.reviewed_by,
      reviewNote: row.review_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_type') THEN
          CREATE TYPE request_type AS ENUM (
            'prayer_support','financial_aid','welfare_help','budget_request',
            'event_approval','reimbursement','leader_apology','savings_withdrawal'
          );
        ELSE
          -- Add savings_withdrawal if it doesn't exist
          BEGIN
            ALTER TYPE request_type ADD VALUE 'savings_withdrawal';
          EXCEPTION WHEN duplicate_object THEN NULL;
          END;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'request_status') THEN
          CREATE TYPE request_status AS ENUM ('pending','in_review','approved','rejected');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS association_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type request_type NOT NULL,
        title text NOT NULL,
        description text NOT NULL,
        requester_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        requester_name text NOT NULL,
        requester_role text NOT NULL,
        amount bigint,
        status request_status NOT NULL DEFAULT 'pending',
        reviewed_by text,
        review_note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    
    // Add missing columns
    await this.databaseService.query(`
      ALTER TABLE association_requests ADD COLUMN IF NOT EXISTS amount bigint
    `);
    await this.databaseService.query(`
      ALTER TABLE association_requests ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES members(id) ON DELETE SET NULL
    `);
    await this.databaseService.query(`
      ALTER TABLE association_requests ADD COLUMN IF NOT EXISTS member_savings_balance_rwf bigint
    `);

    // Create indexes
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS association_requests_status_idx ON association_requests (status)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS association_requests_type_idx ON association_requests (type)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS association_requests_requester_idx ON association_requests (requester_user_id)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS association_requests_member_idx ON association_requests (member_id)`,
    );
  }
}
