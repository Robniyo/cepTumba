import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { AppRole } from '../auth/auth-role.type';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { InitiateSavingsMobileMoneyDto } from './dto/initiate-savings-mobile-money.dto';
import {
  MobileMoneyPaymentStatus,
  MobileMoneyProvider,
} from './finance.types';

const STATUS_SUCCESS_VALUES = new Set(['SUCCESS', 'COMPLETED', 'PAID', 'OK']);
const STATUS_FAILED_VALUES = new Set([
  'FAILED',
  'DECLINED',
  'CANCELLED',
  'CANCELED',
  'ERROR',
  'EXPIRED',
]);
const STATUS_CANCELLED_VALUES = new Set(['CANCELLED', 'CANCELED']);

const MTN_PREFIXES = new Set(['078', '079']);
const AIRTEL_PREFIXES = new Set(['072', '073']);
const FINANCE_REVIEWER_ROLES: AppRole[] = ['president', 'accountant', 'secretary'];

type MobileMoneyPaymentRow = {
  id: string;
  request_ref: string;
  member_id: string;
  initiated_by_user_id: string;
  provider: MobileMoneyProvider;
  phone: string;
  amount: string;
  note: string | null;
  message: string | null;
  description: string | null;
  status: MobileMoneyPaymentStatus;
  external_transaction_id: string | null;
  init_response: Record<string, unknown> | null;
  callback_payload: Record<string, unknown> | null;
  report_match: Record<string, unknown> | null;
  failure_reason: string | null;
  reconcile_attempts: number;
  last_reconciled_at: string | null;
  settled_at: string | null;
  finance_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type MobileMoneyPaymentResponse = {
  id: string;
  requestRef: string;
  memberId: string;
  initiatedByUserId: string;
  provider: MobileMoneyProvider;
  phone: string;
  amount: number;
  note: string | null;
  message: string | null;
  description: string | null;
  status: MobileMoneyPaymentStatus;
  externalTransactionId: string | null;
  failureReason: string | null;
  reconcileAttempts: number;
  financeTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
};

type LmbTechPaymentResponse = {
  status?: unknown;
  message?: unknown;
  data?: Record<string, unknown> | null;
  raw?: unknown;
};

@Injectable()
export class FinancePaymentsService implements OnModuleInit {
  private readonly logger = new Logger(FinancePaymentsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  async initiateSavingsMobileMoneyPayment(
    dto: InitiateSavingsMobileMoneyDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<MobileMoneyPaymentResponse> {
    const phone = this.normalizePhone(dto.phone);
    if (!phone) {
      throw new BadRequestException('Invalid phone number. Use format 07XXXXXXXX.');
    }

    const provider = this.detectProvider(phone);
    if (!provider) {
      throw new BadRequestException(
        'Only MTN MoMo (078/079) and Airtel Money (072/073) numbers are supported.',
      );
    }

    const paymentMethod = this.paymentMethodForProvider(provider);

    const member = await this.resolveMemberContext(currentUser.sub);

    const requestRef = this.newRequestRef('SAV');
    const note = dto.note?.trim() || `Savings deposit for ${member.fullName}`;
    const message =
      dto.message?.trim() ||
      'Thank you for supporting your CEP Tumba savings account.';

    const inserted = await this.databaseService.query<MobileMoneyPaymentRow>(
      `
      INSERT INTO finance_mobile_money_payments (
        request_ref,
        member_id,
        initiated_by_user_id,
        provider,
        phone,
        amount,
        note,
        message,
        description,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
      RETURNING
        id,
        request_ref,
        member_id,
        initiated_by_user_id,
        provider::text AS provider,
        phone,
        amount,
        note,
        message,
        description,
        status::text AS status,
        external_transaction_id,
        init_response,
        callback_payload,
        report_match,
        failure_reason,
        reconcile_attempts,
        last_reconciled_at,
        settled_at,
        finance_transaction_id,
        created_at,
        updated_at
      `,
      [
        requestRef,
        member.memberId,
        currentUser.sub,
        provider,
        phone,
        dto.amount,
        note,
        message,
        dto.description?.trim() || null,
      ],
    );

    const payment = inserted.rows[0];

    try {
      const apiResponse = await this.requestLmbTechPayment({
        email: member.email,
        name: member.fullName,
        amount: dto.amount,
        phone,
        paymentMethod,
        servicePaid: dto.description?.trim() || 'savings_deposit',
        referenceId: requestRef,
        callbackUrl: this.lmbTechCallbackUrl(),
      });

      const derivedStatus = this.normalizeGatewayStatus([
        this.pickField(apiResponse, ['status', 'state']),
        this.pickField(this.readObject(apiResponse.data), ['status', 'state']),
      ]);
      const externalTransactionId = this.firstString([
        this.pickField(apiResponse, ['transaction_id', 'transactionId', 'id']),
        this.pickField(this.readObject(apiResponse.data), [
          'transaction_id',
          'transactionId',
          'id',
        ]),
      ]);

      const updated = await this.databaseService.query<MobileMoneyPaymentRow>(
        `
        UPDATE finance_mobile_money_payments
        SET
          init_response = $2::jsonb,
          external_transaction_id = COALESCE($3, external_transaction_id),
          status = $4::mobile_money_status,
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          request_ref,
          member_id,
          initiated_by_user_id,
          provider::text AS provider,
          phone,
          amount,
          note,
          message,
          description,
          status::text AS status,
          external_transaction_id,
          init_response,
          callback_payload,
          report_match,
          failure_reason,
          reconcile_attempts,
          last_reconciled_at,
          settled_at,
          finance_transaction_id,
          created_at,
          updated_at
        `,
        [payment.id, JSON.stringify(apiResponse), externalTransactionId, derivedStatus],
      );

      const refreshedPayment = updated.rows[0];

      if (refreshedPayment.status === 'success') {
        await this.settleSuccessfulPayment(refreshedPayment.id);
      }

      this.activityLogService.logSystem({
        action: `FINANCE_MOMO_INIT: ${refreshedPayment.id}`,
        metadata: {
          payment_id: refreshedPayment.id,
          request_ref: requestRef,
          provider,
          actor_id: currentUser.sub,
          amount: dto.amount,
          status: refreshedPayment.status,
        },
      });

      return this.toResponse(refreshedPayment);
    } catch (error) {
      const messageText = this.errorMessage(error);
      const failed = await this.databaseService.query<MobileMoneyPaymentRow>(
        `
        UPDATE finance_mobile_money_payments
        SET status = 'failed', failure_reason = $2, updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          request_ref,
          member_id,
          initiated_by_user_id,
          provider::text AS provider,
          phone,
          amount,
          note,
          message,
          description,
          status::text AS status,
          external_transaction_id,
          init_response,
          callback_payload,
          report_match,
          failure_reason,
          reconcile_attempts,
          last_reconciled_at,
          settled_at,
          finance_transaction_id,
          created_at,
          updated_at
        `,
        [payment.id, messageText],
      );

      this.activityLogService.logSystem({
        action: `FINANCE_MOMO_INIT_FAILED: ${payment.id}`,
        metadata: {
          payment_id: payment.id,
          request_ref: requestRef,
          provider,
          actor_id: currentUser.sub,
          amount: dto.amount,
          reason: messageText,
        },
      });

      const failedPayment = failed.rows[0];
      if (failedPayment) {
        return this.toResponse(failedPayment);
      }

      throw new BadRequestException(
        `Failed to initiate mobile money payment: ${messageText}`,
      );
    }
  }

  async getSavingsMobileMoneyPayment(
    paymentId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<MobileMoneyPaymentResponse> {
    const result = await this.databaseService.query<MobileMoneyPaymentRow>(
      `
      SELECT
        id,
        request_ref,
        member_id,
        initiated_by_user_id,
        provider::text AS provider,
        phone,
        amount,
        note,
        message,
        description,
        status::text AS status,
        external_transaction_id,
        init_response,
        callback_payload,
        report_match,
        failure_reason,
        reconcile_attempts,
        last_reconciled_at,
        settled_at,
        finance_transaction_id,
        created_at,
        updated_at
      FROM finance_mobile_money_payments
      WHERE id = $1
      LIMIT 1
      `,
      [paymentId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Payment not found');
    }

    const payment = result.rows[0];
    const canViewAny = FINANCE_REVIEWER_ROLES.includes(currentUser.role);
    if (!canViewAny && payment.initiated_by_user_id !== currentUser.sub) {
      throw new ForbiddenException('You can only view your own mobile money payments');
    }

    const refreshedPayment =
      payment.status === 'pending'
        ? await this.refreshPendingPaymentFromGateway(payment)
        : null;

    return this.toResponse(refreshedPayment ?? payment);
  }

  async handleCallback(
    payload: Record<string, unknown>,
  ): Promise<{ matched: boolean; paymentId?: string; status: MobileMoneyPaymentStatus }> {
    const parsed = this.parseCallbackPayload(payload);
    const payment = await this.findPaymentForCallback(parsed.referenceId);
    if (!payment) {
      this.logger.warn(
        `Unmatched LMBTech callback received: reference_id=${parsed.referenceId ?? 'n/a'}, transaction_id=${parsed.transactionId ?? 'n/a'}`,
      );
      return { matched: false, status: parsed.status };
    }

    const targetStatus =
      payment.status === 'success' ||
      payment.status === 'failed' ||
      payment.status === 'expired' ||
      payment.status === 'cancelled'
        ? payment.status
        : parsed.status;

    const updated = await this.databaseService.query<MobileMoneyPaymentRow>(
      `
      UPDATE finance_mobile_money_payments
      SET
        status = $2::mobile_money_status,
        external_transaction_id = COALESCE($3, external_transaction_id),
        callback_payload = $4::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING
        id,
        request_ref,
        member_id,
        initiated_by_user_id,
        provider::text AS provider,
        phone,
        amount,
        note,
        message,
        description,
        status::text AS status,
        external_transaction_id,
        init_response,
        callback_payload,
        report_match,
        failure_reason,
        reconcile_attempts,
        last_reconciled_at,
        settled_at,
        finance_transaction_id,
        created_at,
        updated_at
      `,
      [payment.id, targetStatus, parsed.transactionId ?? null, JSON.stringify(payload)],
    );

    const refreshedPayment = updated.rows[0];

    if (refreshedPayment.status === 'success') {
      await this.settleSuccessfulPayment(refreshedPayment.id);
    }

    this.activityLogService.logSystem({
      action: `FINANCE_MOMO_CALLBACK: ${refreshedPayment.id}`,
      metadata: {
        payment_id: refreshedPayment.id,
        request_ref: refreshedPayment.request_ref,
        status: refreshedPayment.status,
          external_transaction_id: parsed.transactionId ?? null,
      },
    });

    return {
      matched: true,
      paymentId: refreshedPayment.id,
      status: refreshedPayment.status,
    };
  }

  private async settleSuccessfulPayment(paymentId: string): Promise<void> {
    await this.databaseService.withTransaction(async (client) => {
      const paymentResult = await client.query<MobileMoneyPaymentRow>(
        `
        SELECT
          id,
          request_ref,
          member_id,
          initiated_by_user_id,
          provider::text AS provider,
          phone,
          amount,
          note,
          message,
          description,
          status::text AS status,
          external_transaction_id,
          init_response,
          callback_payload,
          report_match,
          failure_reason,
          reconcile_attempts,
          last_reconciled_at,
          settled_at,
          finance_transaction_id,
          created_at,
          updated_at
        FROM finance_mobile_money_payments
        WHERE id = $1
        FOR UPDATE
        `,
        [paymentId],
      );

      if (paymentResult.rowCount === 0) {
        return;
      }

      const payment = paymentResult.rows[0];
      if (payment.status !== 'success') {
        return;
      }

      if (payment.finance_transaction_id) {
        return;
      }

      const reference = await this.generateReferenceWithClient(client);
      const recordedBy = await this.resolveRecordedByNameWithClient(
        client,
        payment.initiated_by_user_id,
      );

      const transaction = await client.query<{ id: string }>(
        `
        INSERT INTO finance_transactions (
          date,
          type,
          fund_id,
          amount,
          direction,
          description,
          member_id,
          reference,
          status,
          recorded_by_user_id,
          recorded_by,
          payment_method
        )
        VALUES (
          CURRENT_DATE,
          'savings_deposit',
          'savings',
          $1,
          'in',
          $2,
          $3,
          $4,
          'approved',
          $5,
          $6,
          $7
        )
        RETURNING id
        `,
        [
          Number(payment.amount),
          payment.description ??
            `Savings deposit via ${this.providerLabel(payment.provider)}`,
          payment.member_id,
          reference,
          payment.initiated_by_user_id,
          recordedBy,
          payment.provider,
        ],
      );

      const financeTransactionId = transaction.rows[0].id;

      await client.query(
        `
        UPDATE finance_mobile_money_payments
        SET
          finance_transaction_id = $2,
          settled_at = now(),
          updated_at = now()
        WHERE id = $1
        `,
        [payment.id, financeTransactionId],
      );

      this.activityLogService.logSystem({
        action: `FINANCE_MOMO_SETTLED: ${payment.id}`,
        metadata: {
          payment_id: payment.id,
          request_ref: payment.request_ref,
          finance_transaction_id: financeTransactionId,
          amount: Number(payment.amount),
          provider: payment.provider,
          member_id: payment.member_id,
        },
      });
    });
  }

  private parseCallbackPayload(payload: Record<string, unknown>): {
    referenceId: string | null;
    transactionId: string | null;
    amount: number | null;
    status: MobileMoneyPaymentStatus;
    paymentMethod: string | null;
    action: string | null;
  } {
    const data = this.readObject(payload.data);

    const referenceId = this.firstString([
      this.pickField(payload, ['reference_id', 'referenceId']),
      this.pickField(data, ['reference_id', 'referenceId']),
    ]);

    const transactionId = this.firstString([
      this.pickField(payload, ['transaction_id', 'transactionId', 'transID', 'id']),
      this.pickField(data, ['transaction_id', 'transactionId', 'transID', 'id']),
    ]);

    const amount = this.firstNumber([
      this.pickField(payload, ['amount']),
      this.pickField(data, ['amount']),
    ]);

    const statusRaw = this.firstString([
      this.pickField(payload, ['status', 'state']),
      this.pickField(data, ['status', 'state']),
    ]);
    const status = statusRaw ? this.normalizeGatewayStatus([statusRaw]) : 'pending';

    const paymentMethod = this.firstString([
      this.pickField(payload, ['payment_method', 'paymentMethod']),
      this.pickField(data, ['payment_method', 'paymentMethod']),
    ]);

    const action = this.firstString([
      this.pickField(payload, ['action']),
      this.pickField(data, ['action']),
    ]);

    if (!referenceId || !transactionId || !statusRaw || !action) {
      throw new BadRequestException('Invalid callback data received from LMBTech.');
    }

    return {
      referenceId,
      transactionId,
      amount,
      status,
      paymentMethod,
      action,
    };
  }

  private async findPaymentForCallback(referenceId: string | null): Promise<MobileMoneyPaymentRow | null> {
    if (!referenceId) {
      return null;
    }

    const result = await this.databaseService.query<MobileMoneyPaymentRow>(
      `
      SELECT
        id,
        request_ref,
        member_id,
        initiated_by_user_id,
        provider::text AS provider,
        phone,
        amount,
        note,
        message,
        description,
        status::text AS status,
        external_transaction_id,
        init_response,
        callback_payload,
        report_match,
        failure_reason,
        reconcile_attempts,
        last_reconciled_at,
        settled_at,
        finance_transaction_id,
        created_at,
        updated_at
      FROM finance_mobile_money_payments
      WHERE request_ref = $1
      LIMIT 1
      `,
      [referenceId],
    );

    return result.rows[0] ?? null;
  }

  private async refreshPendingPaymentFromGateway(
    payment: MobileMoneyPaymentRow,
  ): Promise<MobileMoneyPaymentRow | null> {
    const gatewayPayment = await this.fetchLmbTechPaymentStatus(payment.request_ref);
    if (!gatewayPayment) {
      return null;
    }

    const gatewayStatus = this.normalizeGatewayStatus([
      this.pickField(gatewayPayment, ['status', 'state']),
      this.pickField(this.readObject(gatewayPayment.data), ['status', 'state']),
    ]);

    const gatewayTransactionId = this.firstString([
      this.pickField(gatewayPayment, ['transaction_id', 'transactionId', 'id']),
      this.pickField(this.readObject(gatewayPayment.data), [
        'transaction_id',
        'transactionId',
        'id',
      ]),
    ]);

    const gatewayPaymentDate = this.firstString([
      this.pickField(gatewayPayment, ['payment_date', 'paymentDate']),
      this.pickField(this.readObject(gatewayPayment.data), ['payment_date', 'paymentDate']),
    ]);

    if (gatewayStatus === 'pending') {
      return null;
    }

    const updated = await this.databaseService.query<MobileMoneyPaymentRow>(
      `
      UPDATE finance_mobile_money_payments
      SET
        status = $2::mobile_money_status,
        external_transaction_id = COALESCE($3, external_transaction_id),
        callback_payload = COALESCE($4::jsonb, callback_payload),
        updated_at = now()
      WHERE id = $1
      RETURNING
        id,
        request_ref,
        member_id,
        initiated_by_user_id,
        provider::text AS provider,
        phone,
        amount,
        note,
        message,
        description,
        status::text AS status,
        external_transaction_id,
        init_response,
        callback_payload,
        report_match,
        failure_reason,
        reconcile_attempts,
        last_reconciled_at,
        settled_at,
        finance_transaction_id,
        created_at,
        updated_at
      `,
      [
        payment.id,
        gatewayStatus,
        gatewayTransactionId,
        JSON.stringify({
          source: 'lmbtech-status',
          payment_date: gatewayPaymentDate,
          response: gatewayPayment,
        }),
      ],
    );

    const refreshedPayment = updated.rows[0] ?? null;
    if (refreshedPayment?.status === 'success') {
      await this.settleSuccessfulPayment(refreshedPayment.id);
    }

    return refreshedPayment;
  }

  private async fetchLmbTechPaymentStatus(referenceId: string): Promise<LmbTechPaymentResponse | null> {
    return this.requestLmbTech('GET', `${this.lmbTechStatusUrl()}?reference_id=${encodeURIComponent(referenceId)}`);
  }

  private async requestLmbTechPayment(input: {
    email: string;
    name: string;
    amount: number;
    phone: string;
    paymentMethod: string;
    servicePaid: string;
    referenceId: string;
    callbackUrl: string;
  }): Promise<LmbTechPaymentResponse> {
    const payload: Record<string, unknown> = {
      email: input.email,
      name: input.name,
      payment_method: input.paymentMethod,
      amount: input.amount,
      payer_phone: input.phone,
      service_paid: input.servicePaid,
      reference_id: input.referenceId,
      callback_url: input.callbackUrl,
      action: 'pay',
    };

    return this.requestLmbTech('POST', this.lmbTechBaseUrl(), payload);
  }

  private async requestLmbTech(
    method: 'GET' | 'POST',
    url: string,
    payload?: Record<string, unknown>,
  ): Promise<LmbTechPaymentResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: this.lmbTechAuthHeader(),
          ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: method === 'POST' && payload ? JSON.stringify(payload) : undefined,
        signal: controller.signal,
      });

      const rawText = await response.text();
      const rawTextTrimmed = rawText.trim();
      let parsed: unknown = null;

      if (rawTextTrimmed.length > 0) {
        try {
          parsed = JSON.parse(rawTextTrimmed);
        } catch {
          parsed = { message: this.sanitizeGatewayMessage(rawTextTrimmed) };
        }
      }

      const objectPayload = this.readObject(parsed) ?? { raw: rawTextTrimmed };

      if (!response.ok) {
        const maybeMessage = this.firstString([
          this.pickField(objectPayload, ['message', 'error']),
          this.pickField(this.readObject(objectPayload.data), ['message', 'error']),
        ]);

        const sanitized = this.sanitizeGatewayMessage(maybeMessage || rawTextTrimmed);

        throw new Error(sanitized || `LMBTech request failed with HTTP ${response.status}`);
      }

      return objectPayload as LmbTechPaymentResponse;
    } catch (error) {
      const detail = this.formatFetchError(error);
      if (detail) {
        this.logger.warn(`LMBTech request failed (${method} ${url}): ${detail}`);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('LMBTech request timed out after 20 seconds.');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private lmbTechAuthHeader(): string {
    const appKey = this.configService.get<string>('LMBTECH_APP_KEY')?.trim() || '';
    const secretKey = this.configService.get<string>('LMBTECH_SECRET_KEY')?.trim() || '';

    if (!appKey || !secretKey) {
      throw new BadRequestException('Missing LMBTech API credentials.');
    }

    return `Basic ${Buffer.from(`${appKey}:${secretKey}`).toString('base64')}`;
  }

  private lmbTechBaseUrl(): string {
    const configured =
      this.configService.get<string>('LMBTECH_BASE_URL')?.trim() ||
      'https://pay.lmbtech.rw/pay/config/api';

    return configured.replace(/\/+$/, '');
  }

  private lmbTechStatusUrl(): string {
    const baseUrl = this.lmbTechBaseUrl();
    return baseUrl.endsWith('.php') ? baseUrl : `${baseUrl}.php`;
  }

  private lmbTechCallbackUrl(): string {
    const callbackUrl = this.configService.get<string>('LMBTECH_CALLBACK_URL')?.trim() || '';
    if (!callbackUrl) {
      throw new BadRequestException('Missing LMBTech callback URL.');
    }

    return callbackUrl;
  }

  private paymentMethodForProvider(provider: MobileMoneyProvider): string {
    if (provider !== 'momo') {
      throw new BadRequestException(
        'Only MTN MoMo numbers are supported right now. Please use an MTN number.',
      );
    }

    return 'MTN_MOMO_RWA';
  }

  private normalizeGatewayStatus(statusCandidates: unknown[] | unknown): MobileMoneyPaymentStatus {
    const raw = this.firstString(Array.isArray(statusCandidates) ? statusCandidates : [statusCandidates])?.toUpperCase() ?? '';

    if (STATUS_SUCCESS_VALUES.has(raw)) {
      return 'success';
    }
    if (STATUS_CANCELLED_VALUES.has(raw)) {
      return 'cancelled';
    }
    if (STATUS_FAILED_VALUES.has(raw)) {
      return 'failed';
    }

    return 'pending';
  }

  private async resolveMemberContext(
    userId: string,
  ): Promise<{ memberId: string; fullName: string; email: string }> {
    const result = await this.databaseService.query<{
      member_id: string | null;
      full_name: string | null;
      display_name: string | null;
      email: string | null;
    }>(
      `
      SELECT
        u.member_id,
        m.full_name,
        u.display_name,
        u.email
      FROM users u
      LEFT JOIN members m ON m.id = u.member_id
      WHERE u.id = $1
      LIMIT 1
      `,
      [userId],
    );

    const row = result.rows[0];
    if (!row?.member_id) {
      throw new BadRequestException(
        'Your user account is not linked to a member profile.',
      );
    }

    const fullName =
      row.full_name?.trim() || row.display_name?.trim() || row.email?.trim() || 'Member';
    const email = row.email?.trim() || '';

    if (!email) {
      throw new BadRequestException(
        'Your user account is missing an email address required by the payment gateway.',
      );
    }

    return {
      memberId: row.member_id,
      fullName,
      email,
    };
  }

  private normalizePhone(rawPhone: string): string | null {
    const digits = rawPhone.replace(/\D/g, '');

    let value = digits;
    if (value.startsWith('250')) {
      value = `0${value.slice(3)}`;
    }
    if (value.length === 9 && value.startsWith('7')) {
      value = `0${value}`;
    }

    if (value.length !== 10 || !value.startsWith('07')) {
      return null;
    }

    return value;
  }

  private detectProvider(phone: string): MobileMoneyProvider | null {
    const prefix = phone.slice(0, 3);

    if (MTN_PREFIXES.has(prefix)) {
      return 'momo';
    }
    if (AIRTEL_PREFIXES.has(prefix)) {
      return 'airtel_money';
    }

    return null;
  }

  private providerLabel(provider: MobileMoneyProvider): string {
    return provider === 'momo' ? 'MTN MoMo' : 'Airtel Money';
  }

  private formatReportDate(date: Date): number {
    const pad = (value: number) => String(value).padStart(2, '0');

    const value = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
      date.getDate(),
    )}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

    return Number(value);
  }

  private resolveStatus(statusCandidates: unknown[]): MobileMoneyPaymentStatus {
    const raw = this.firstString(statusCandidates)?.toUpperCase() ?? '';

    if (STATUS_SUCCESS_VALUES.has(raw)) {
      return 'success';
    }
    if (STATUS_FAILED_VALUES.has(raw)) {
      return 'failed';
    }

    return 'pending';
  }

  private newRequestRef(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `${prefix}-${Date.now()}-${random}`;
  }

  private async generateReferenceWithClient(client: PoolClient): Promise<string> {
    const result = await client.query<{ nextval: string }>(
      `SELECT nextval('finance_reference_seq') AS nextval`,
    );
    const numeric = Number(result.rows[0]?.nextval ?? '1');
    return `RC-${String(numeric).padStart(5, '0')}`;
  }

  private async resolveRecordedByNameWithClient(
    client: PoolClient,
    userId: string,
  ): Promise<string> {
    const result = await client.query<{
      display_name: string | null;
      email: string | null;
    }>(
      `SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );

    const row = result.rows[0];
    if (row?.display_name?.trim()) return row.display_name.trim();
    if (row?.email?.trim()) return row.email.trim();

    return 'System';
  }

  private toResponse(row: MobileMoneyPaymentRow): MobileMoneyPaymentResponse {
    return {
      id: row.id,
      requestRef: row.request_ref,
      memberId: row.member_id,
      initiatedByUserId: row.initiated_by_user_id,
      provider: row.provider,
      phone: row.phone,
      amount: Number(row.amount),
      note: row.note,
      message: row.message,
      description: row.description,
      status: row.status,
      externalTransactionId: row.external_transaction_id,
      failureReason: row.failure_reason,
      reconcileAttempts: row.reconcile_attempts,
      financeTransactionId: row.finance_transaction_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settledAt: row.settled_at,
    };
  }

  private firstString(values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }

    return null;
  }

  private firstNumber(values: unknown[]): number | null {
    for (const value of values) {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return Math.round(numeric);
      }
    }

    return null;
  }

  private pickField(
    source: Record<string, unknown> | null,
    fields: string[],
  ): unknown {
    if (!source) return null;

    for (const field of fields) {
      if (field in source) {
        return source[field];
      }
    }

    return null;
  }

  private readObject(value: unknown): Record<string, unknown> | null {
    if (this.isObject(value)) {
      return value;
    }

    return null;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim().length > 0) {
      return this.sanitizeGatewayMessage(error.message);
    }

    return 'Unknown payment integration error';
  }

  private sanitizeGatewayMessage(message: string): string {
    const trimmed = message.trim();
    if (!trimmed) {
      return 'Unknown payment integration error';
    }

    if (/<\/?[a-z][\s\S]*>/i.test(trimmed)) {
      const text = trimmed.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length > 0 && text.length <= 160) {
        return text;
      }
      return 'Payment service is temporarily unavailable. Please try again shortly.';
    }

    return trimmed;
  }

  private formatFetchError(error: unknown): string {
    if (error instanceof Error) {
      const code = (error as NodeJS.ErrnoException).code;
      const cause = (error as { cause?: unknown }).cause;
      let causeMessage = '';

      if (cause instanceof Error) {
        const causeCode = (cause as NodeJS.ErrnoException).code;
        causeMessage = `${cause.name}: ${cause.message}`;
        if (causeCode) {
          causeMessage += ` (code=${causeCode})`;
        }
      } else if (typeof cause === 'string') {
        causeMessage = cause;
      }

      return [
        error.name,
        error.message,
        code ? `code=${code}` : null,
        causeMessage ? `cause=${causeMessage}` : null,
      ]
        .filter(Boolean)
        .join(' | ');
    }

    return '';
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_money_provider') THEN
          CREATE TYPE mobile_money_provider AS ENUM ('momo', 'airtel_money');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mobile_money_status') THEN
          CREATE TYPE mobile_money_status AS ENUM ('pending', 'success', 'failed', 'expired', 'cancelled');
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
      CREATE TABLE IF NOT EXISTS finance_mobile_money_payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_ref text NOT NULL UNIQUE,
        member_id uuid REFERENCES members(id) ON DELETE SET NULL,
        initiated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        provider mobile_money_provider NOT NULL,
        phone text NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        note text,
        message text,
        description text,
        status mobile_money_status NOT NULL DEFAULT 'pending',
        external_transaction_id text,
        init_response jsonb,
        callback_payload jsonb,
        report_match jsonb,
        failure_reason text,
        reconcile_attempts integer NOT NULL DEFAULT 0,
        last_reconciled_at timestamptz,
        settled_at timestamptz,
        finance_transaction_id uuid UNIQUE REFERENCES finance_transactions(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      ALTER TABLE finance_mobile_money_payments
      ALTER COLUMN member_id DROP NOT NULL
    `);

    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'finance_mobile_money_payments_member_id_fkey'
            AND conrelid = 'finance_mobile_money_payments'::regclass
        ) THEN
          BEGIN
            ALTER TABLE finance_mobile_money_payments
            ADD CONSTRAINT finance_mobile_money_payments_member_id_fkey
            FOREIGN KEY (member_id)
            REFERENCES members(id)
            ON DELETE SET NULL;
          EXCEPTION
            WHEN duplicate_object THEN
              NULL;
          END;
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      ALTER TABLE finance_mobile_money_payments
      ALTER COLUMN initiated_by_user_id DROP NOT NULL
    `);

    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'finance_mobile_money_payments_initiated_by_user_id_fkey'
            AND conrelid = 'finance_mobile_money_payments'::regclass
        ) THEN
          BEGIN
            ALTER TABLE finance_mobile_money_payments
            ADD CONSTRAINT finance_mobile_money_payments_initiated_by_user_id_fkey
            FOREIGN KEY (initiated_by_user_id)
            REFERENCES users(id)
            ON DELETE SET NULL;
          EXCEPTION
            WHEN duplicate_object THEN
              NULL;
          END;
        END IF;
      END $$;
    `);

    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS finance_mobile_payments_status_idx ON finance_mobile_money_payments (status)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS finance_mobile_payments_member_idx ON finance_mobile_money_payments (member_id)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS finance_mobile_payments_created_idx ON finance_mobile_money_payments (created_at DESC)`,
    );
  }
}
