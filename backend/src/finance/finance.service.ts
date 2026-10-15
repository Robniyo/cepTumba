import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AppRole } from '../auth/auth-role.type';
import { toDateOnlyString } from '../common/date-utils';
import { buildExportStamp, exportTable, ExportColumn, ExportFormat } from '../common/export-utils';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import {
  FundId,
  PaymentMethod,
  TxDirection,
  TxStatus,
  TxType,
} from './finance.types';

const FINANCE_MANAGER_ROLES: AppRole[] = ['president', 'accountant'];
const FINANCE_VIEWER_ROLES: AppRole[] = [
  'president',
  'accountant',
  'secretary',
];
const FINANCE_APPROVER_ROLES: AppRole[] = ['president', 'accountant'];

type TransactionRow = {
  id: string;
  date: string;
  type: TxType;
  fund_id: FundId;
  amount: string;
  direction: TxDirection;
  description: string;
  member_id: string | null;
  reference: string;
  status: TxStatus;
  recorded_by_user_id: string | null;
  recorded_by: string;
  payment_method: PaymentMethod;
  created_at: string;
  updated_at: string;
};

type BudgetRow = {
  id: string;
  period: string;
  label: string;
  fund_id: FundId;
  category: string;
  budgeted: string;
  created_at: string;
  updated_at: string;
};

export type TransactionResponse = {
  id: string;
  date: string;
  type: TxType;
  fundId: FundId;
  amount: number;
  direction: TxDirection;
  description: string;
  memberId: string | null;
  reference: string;
  status: TxStatus;
  recordedBy: string;
  paymentMethod: PaymentMethod;
  createdAt: string;
  updatedAt: string;
};

export type BudgetResponse = {
  id: string;
  period: string;
  label: string;
  fundId: FundId;
  category: string;
  budgeted: number;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class FinanceService implements OnModuleInit {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  private buildTransactionFilters(
    query: ListTransactionsDto,
    currentUser: { sub: string; role: AppRole },
  ): { params: unknown[]; whereSql: string } {
    const isViewer = FINANCE_VIEWER_ROLES.includes(currentUser.role);
    const isMember = currentUser.role === 'member';

    const params: unknown[] = [];
    const wheres: string[] = [];

    // Members can only view savings transactions that are their own
    if (!isViewer && isMember) {
      params.push(currentUser.sub);
      wheres.push(
        `t.member_id = (SELECT member_id FROM users WHERE id = $${params.length}) AND t.fund_id = 'savings'`,
      );
    } else if (!isViewer) {
      throw new ForbiddenException('You do not have access to finance records');
    }

    if (query.fundId) {
      params.push(query.fundId);
      wheres.push(`t.fund_id = $${params.length}::fund_id`);
    }
    if (query.type) {
      params.push(query.type);
      wheres.push(`t.type = $${params.length}::tx_type`);
    }
    if (query.status) {
      params.push(query.status);
      wheres.push(`t.status = $${params.length}::tx_status`);
    }
    if (query.memberId) {
      params.push(query.memberId);
      wheres.push(`t.member_id = $${params.length}`);
    }

    const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
    return { params, whereSql };
  }

  async listTransactions(
    query: ListTransactionsDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ items: TransactionResponse[]; total: number }> {
    const { params, whereSql } = this.buildTransactionFilters(query, currentUser);

    const listParams = [...params];
    let pagination = '';
    if (typeof query.offset === 'number' && query.offset > 0) {
      pagination += `OFFSET $${listParams.push(query.offset)}`;
    }
    if (typeof query.limit === 'number') {
      pagination += `${pagination ? ' ' : ''}LIMIT $${listParams.push(query.limit)}`;
    }

    const listResult = await this.databaseService.query<TransactionRow>(
      `
      SELECT t.id, t.date, t.type::text AS type, t.fund_id::text AS fund_id,
             t.amount, t.direction::text AS direction, t.description, t.member_id,
             t.reference, t.status::text AS status, t.recorded_by_user_id,
             COALESCE(t.recorded_by, u.display_name, u.email, 'System') AS recorded_by,
             t.payment_method::text AS payment_method, t.created_at, t.updated_at
      FROM finance_transactions t
      LEFT JOIN users u ON u.id = t.recorded_by_user_id
      ${whereSql}
      ORDER BY t.date DESC, t.created_at DESC
      ${pagination}
      `,
      listParams,
    );

    const countResult = await this.databaseService.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM finance_transactions t ${whereSql}`,
      params,
    );

    return {
      items: listResult.rows.map((r) => this.mapTransaction(r)),
      total: countResult.rows[0]?.total ?? 0,
    };
  }

  async exportTransactions(
    format: ExportFormat,
    query: ListTransactionsDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const { params, whereSql } = this.buildTransactionFilters(query, currentUser);

    const listResult = await this.databaseService.query<TransactionRow>(
      `
      SELECT t.id, t.date, t.type::text AS type, t.fund_id::text AS fund_id,
             t.amount, t.direction::text AS direction, t.description, t.member_id,
             t.reference, t.status::text AS status, t.recorded_by_user_id,
             COALESCE(t.recorded_by, u.display_name, u.email, 'System') AS recorded_by,
             t.payment_method::text AS payment_method, t.created_at, t.updated_at
      FROM finance_transactions t
      LEFT JOIN users u ON u.id = t.recorded_by_user_id
      ${whereSql}
      ORDER BY t.date DESC, t.created_at DESC
      `,
      params,
    );

    const items = listResult.rows.map((row) => this.mapTransaction(row));
    const columns: ExportColumn<TransactionResponse>[] = [
      { key: 'id', header: 'ID' },
      { key: 'date', header: 'Date' },
      { key: 'type', header: 'Type' },
      { key: 'fundId', header: 'Fund' },
      { key: 'amount', header: 'Amount' },
      { key: 'direction', header: 'Direction' },
      { key: 'description', header: 'Description' },
      { key: 'memberId', header: 'Member ID' },
      { key: 'reference', header: 'Reference' },
      { key: 'status', header: 'Status' },
      { key: 'recordedBy', header: 'Recorded By' },
      { key: 'paymentMethod', header: 'Payment Method' },
      { key: 'createdAt', header: 'Created At' },
      { key: 'updatedAt', header: 'Updated At' },
    ];

    const { buffer, contentType, extension } = await exportTable(
      'Finance Transactions',
      items,
      columns,
      format,
    );
    const stamp = buildExportStamp();
    return {
      buffer,
      contentType,
      fileName: `finance_transactions_${stamp}.${extension}`,
    };
  }

  async createTransaction(
    dto: CreateTransactionDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<TransactionResponse> {
    if (!FINANCE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and accountant can record transactions');
    }

    if (dto.fundId === 'savings' && !dto.memberId) {
      throw new BadRequestException('memberId is required for savings transactions');
    }

    const status =
      dto.status ?? (currentUser.role === 'president' ? 'approved' : 'pending');

    const reference = await this.generateReference();
    const recordedBy = await this.resolveDisplayName(currentUser.sub, currentUser.email);

    const result = await this.databaseService.query<TransactionRow>(
      `
      INSERT INTO finance_transactions (
        date, type, fund_id, amount, direction, description, member_id,
        reference, status, recorded_by_user_id, recorded_by, payment_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, date, type::text AS type, fund_id::text AS fund_id,
                amount, direction::text AS direction, description, member_id,
                reference, status::text AS status, recorded_by_user_id, recorded_by,
                payment_method::text AS payment_method, created_at, updated_at
      `,
      [
        dto.date,
        dto.type,
        dto.fundId,
        dto.amount,
        dto.direction,
        dto.description.trim(),
        dto.memberId ?? null,
        reference,
        status,
        currentUser.sub,
        recordedBy,
        dto.paymentMethod,
      ],
    );

    this.activityLogService.logSystem({
      action: `FINANCE_TX_CREATE: ${result.rows[0].id}`,
      metadata: {
        transaction_id: result.rows[0].id,
        amount: dto.amount,
        fund_id: dto.fundId,
        direction: dto.direction,
        status,
        actor_id: currentUser.sub,
      },
    });

    return this.mapTransaction(result.rows[0]);
  }

  async updateTransactionStatus(
    transactionId: string,
    dto: UpdateTransactionStatusDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<TransactionResponse> {
    if (!FINANCE_APPROVER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and accountant can change transaction status');
    }

    const result = await this.databaseService.query<TransactionRow>(
      `
      UPDATE finance_transactions SET status = $2::tx_status, updated_at = now()
      WHERE id = $1
      RETURNING id, date, type::text AS type, fund_id::text AS fund_id, amount,
                direction::text AS direction, description, member_id, reference,
                status::text AS status, recorded_by_user_id, recorded_by,
                payment_method::text AS payment_method, created_at, updated_at
      `,
      [transactionId, dto.status],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Transaction not found');
    }

    this.activityLogService.logSystem({
      action: `FINANCE_TX_STATUS: ${transactionId}`,
      metadata: {
        transaction_id: transactionId,
        new_status: dto.status,
        actor_id: currentUser.sub,
      },
    });

    return this.mapTransaction(result.rows[0]);
  }

  async deleteTransaction(
    transactionId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ deletedTransactionId: string }> {
    if (currentUser.role !== 'president' && currentUser.role !== 'accountant') {
      throw new ForbiddenException('Only president and accountant can delete transactions');
    }

    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM finance_transactions WHERE id = $1 RETURNING id`,
      [transactionId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Transaction not found');
    }

    this.activityLogService.logSystem({
      action: `FINANCE_TX_DELETE: ${transactionId}`,
      metadata: { transaction_id: transactionId, actor_id: currentUser.sub },
    });

    return { deletedTransactionId: transactionId };
  }

  async listBudgets(currentUser: {
    role: AppRole;
  }): Promise<BudgetResponse[]> {
    if (!FINANCE_VIEWER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('You do not have access to budgets');
    }
    const result = await this.databaseService.query<BudgetRow>(
      `SELECT id, period, label, fund_id::text AS fund_id, category, budgeted, created_at, updated_at
       FROM finance_budgets ORDER BY period DESC, created_at DESC`,
    );
    return result.rows.map((r) => this.mapBudget(r));
  }

  async createBudget(
    dto: CreateBudgetDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<BudgetResponse> {
    if (!FINANCE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and accountant can create budgets');
    }
    const result = await this.databaseService.query<BudgetRow>(
      `
      INSERT INTO finance_budgets (period, label, fund_id, category, budgeted)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, period, label, fund_id::text AS fund_id, category, budgeted, created_at, updated_at
      `,
      [dto.period, dto.label, dto.fundId, dto.category, dto.budgeted],
    );
    return this.mapBudget(result.rows[0]);
  }

  async updateBudget(
    budgetId: string,
    dto: UpdateBudgetDto,
    currentUser: { role: AppRole },
  ): Promise<BudgetResponse> {
    if (!FINANCE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and accountant can update budgets');
    }

    const result = await this.databaseService.query<BudgetRow>(
      `
      UPDATE finance_budgets SET
        period = COALESCE($2, period),
        label = COALESCE($3, label),
        fund_id = COALESCE($4::fund_id, fund_id),
        category = COALESCE($5, category),
        budgeted = COALESCE($6, budgeted),
        updated_at = now()
      WHERE id = $1
      RETURNING id, period, label, fund_id::text AS fund_id, category, budgeted, created_at, updated_at
      `,
      [
        budgetId,
        dto.period ?? null,
        dto.label ?? null,
        dto.fundId ?? null,
        dto.category ?? null,
        dto.budgeted ?? null,
      ],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Budget not found');
    }

    return this.mapBudget(result.rows[0]);
  }

  async deleteBudget(
    budgetId: string,
    currentUser: { role: AppRole },
  ): Promise<{ deletedBudgetId: string }> {
    if (!FINANCE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and accountant can delete budgets');
    }
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM finance_budgets WHERE id = $1 RETURNING id`,
      [budgetId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Budget not found');
    }
    return { deletedBudgetId: budgetId };
  }

  async getMySavings(
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ balance: number; transactions: TransactionResponse[] }> {
    const memberId = await this.resolveMemberId(currentUser.sub);
    return this.getMemberSavings(memberId, currentUser);
  }

  async getMemberSavings(
    memberId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ balance: number; transactions: TransactionResponse[] }> {
    // A member can see their own savings; leaders/viewers see any.
    const isViewer = FINANCE_VIEWER_ROLES.includes(currentUser.role);
    if (!isViewer) {
      const ownResult = await this.databaseService.query<{ member_id: string | null }>(
        `SELECT member_id FROM users WHERE id = $1 LIMIT 1`,
        [currentUser.sub],
      );
      const ownMemberId = ownResult.rows[0]?.member_id ?? null;
      if (!ownMemberId || ownMemberId !== memberId) {
        throw new ForbiddenException('You can only view your own savings');
      }
    }

    const result = await this.databaseService.query<TransactionRow>(
      `
      SELECT id, date, type::text AS type, fund_id::text AS fund_id, amount,
             direction::text AS direction, description, member_id, reference,
             status::text AS status, recorded_by_user_id,
             COALESCE(recorded_by, 'System') AS recorded_by,
             payment_method::text AS payment_method, created_at, updated_at
      FROM finance_transactions
      WHERE member_id = $1 AND fund_id = 'savings'
      ORDER BY date DESC, created_at DESC
      `,
      [memberId],
    );

    const transactions = result.rows.map((r) => this.mapTransaction(r));
    const balance = transactions
      .filter((t) => t.status === 'approved')
      .reduce((sum, t) => sum + (t.direction === 'in' ? t.amount : -t.amount), 0);

    return { balance, transactions };
  }

  async getSummary(currentUser: {
    role: AppRole;
  }): Promise<{
    funds: { fundId: FundId; balance: number }[];
    totalIn: number;
    totalOut: number;
    pendingApprovals: number;
  }> {
    if (!FINANCE_VIEWER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('You do not have access to finance reports');
    }

    const fundsResult = await this.databaseService.query<{
      fund_id: FundId;
      balance: string;
    }>(
      `
      SELECT fund_id::text AS fund_id,
             COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)::bigint AS balance
      FROM finance_transactions
      WHERE status = 'approved'
      GROUP BY fund_id
      `,
    );

    const totalsResult = await this.databaseService.query<{
      total_in: string;
      total_out: string;
    }>(
      `
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0)::bigint AS total_in,
        COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0)::bigint AS total_out
      FROM finance_transactions
      WHERE status = 'approved'
      `,
    );

    const pendingResult = await this.databaseService.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM finance_transactions WHERE status = 'pending'`,
    );

    return {
      funds: fundsResult.rows.map((r) => ({
        fundId: r.fund_id,
        balance: Number(r.balance),
      })),
      totalIn: Number(totalsResult.rows[0]?.total_in ?? 0),
      totalOut: Number(totalsResult.rows[0]?.total_out ?? 0),
      pendingApprovals: pendingResult.rows[0]?.total ?? 0,
    };
  }

  private async generateReference(): Promise<string> {
    const result = await this.databaseService.query<{ nextval: string }>(
      `SELECT nextval('finance_reference_seq') AS nextval`,
    );
    const num = Number(result.rows[0]?.nextval ?? 1);
    return `RC-${String(num).padStart(5, '0')}`;
  }

  private async resolveMemberId(userId: string): Promise<string> {
    const result = await this.databaseService.query<{ member_id: string | null }>(
      `SELECT member_id FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );

    const memberId = result.rows[0]?.member_id ?? null;
    if (!memberId) {
      throw new BadRequestException(
        'Your user account is not linked to a member profile.',
      );
    }

    return memberId;
  }

  private async resolveDisplayName(
    userId: string,
    fallbackEmail: string,
  ): Promise<string> {
    const result = await this.databaseService.query<{
      display_name: string | null;
      email: string | null;
    }>(
      `SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    if (row?.display_name?.trim()) return row.display_name.trim();
    if (row?.email?.trim()) return row.email.trim();
    return fallbackEmail || 'System';
  }

  private mapTransaction(row: TransactionRow): TransactionResponse {
    return {
      id: row.id,
      date: toDateOnlyString(row.date) as string,
      type: row.type,
      fundId: row.fund_id,
      amount: Number(row.amount),
      direction: row.direction,
      description: row.description,
      memberId: row.member_id,
      reference: row.reference,
      status: row.status,
      recordedBy: row.recorded_by,
      paymentMethod: row.payment_method,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapBudget(row: BudgetRow): BudgetResponse {
    return {
      id: row.id,
      period: row.period,
      label: row.label,
      fundId: row.fund_id,
      category: row.category,
      budgeted: Number(row.budgeted),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fund_id') THEN
          CREATE TYPE fund_id AS ENUM ('welfare','evangelism','social','project','tithe','savings');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_type') THEN
          CREATE TYPE tx_type AS ENUM ('offering','tithe','contribution','savings_deposit','savings_withdraw','expense','other_income');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_status') THEN
          CREATE TYPE tx_status AS ENUM ('approved','pending','rejected');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tx_direction') THEN
          CREATE TYPE tx_direction AS ENUM ('in','out');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
          CREATE TYPE payment_method AS ENUM ('cash','mpesa','bank','card','other');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method')
           AND NOT EXISTS (
             SELECT 1 FROM pg_enum
             WHERE enumtypid = 'payment_method'::regtype
               AND enumlabel = 'momo'
           ) THEN
          ALTER TYPE payment_method ADD VALUE 'momo';
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method')
           AND NOT EXISTS (
             SELECT 1 FROM pg_enum
             WHERE enumtypid = 'payment_method'::regtype
               AND enumlabel = 'airtel_money'
           ) THEN
          ALTER TYPE payment_method ADD VALUE 'airtel_money';
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE SEQUENCE IF NOT EXISTS finance_reference_seq START WITH 1001 INCREMENT BY 1
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS finance_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        date date NOT NULL DEFAULT CURRENT_DATE,
        type tx_type NOT NULL,
        fund_id fund_id NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        direction tx_direction NOT NULL,
        description text NOT NULL,
        member_id uuid REFERENCES members(id) ON DELETE SET NULL,
        reference text NOT NULL UNIQUE,
        status tx_status NOT NULL DEFAULT 'pending',
        recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        recorded_by text,
        payment_method payment_method NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE finance_transactions ADD COLUMN IF NOT EXISTS date date NOT NULL DEFAULT CURRENT_DATE
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS finance_budgets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        period text NOT NULL,
        label text NOT NULL,
        fund_id fund_id NOT NULL,
        category text NOT NULL,
        budgeted bigint NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS finance_tx_date_idx ON finance_transactions (date DESC)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS finance_tx_fund_idx ON finance_transactions (fund_id)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS finance_tx_member_idx ON finance_transactions (member_id)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS finance_tx_status_idx ON finance_transactions (status)`,
    );
  }
}
