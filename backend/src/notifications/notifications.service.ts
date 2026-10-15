import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { promises as dns } from 'dns';
import webpush from 'web-push';
import { APP_ROLES, AppRole } from '../auth/auth-role.type';
import { parseDateOnly } from '../common/date-utils';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { UpsertPushSubscriptionDto } from './dto/upsert-push-subscription.dto';
import {
  EmailTemplateInput,
  renderEmail,
  renderEmailPlainText,
} from './email-templates';

type NotificationAudienceType = 'all' | 'leaders_only' | 'role_based';

type NotificationRecipientRow = {
  id: string;
  email: string;
  display_name: string;
  role: AppRole;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const LEADER_ROLES: AppRole[] = APP_ROLES.filter((role) => role !== 'member');

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly emailTransporter: Transporter | null;
  private readonly emailFrom: string | null;
  private readonly emailEnabled: boolean;
  private readonly pushEnabled: boolean;
  private readonly smtpHostConfig: string | null;
  private readonly smtpPortConfig: number | null;
  private readonly smtpSecureConfig: boolean;
  private readonly smtpUserConfig: string | undefined;
  private readonly smtpPassConfig: string | undefined;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly activityLogService: ActivityLogService,
  ) {
    const smtpHost = this.configService.get<string>('SMTP_HOST')?.trim();
    const smtpPortRaw = this.configService.get<string>('SMTP_PORT') ?? '587';
    const smtpPort = Number(smtpPortRaw);
    const smtpSecure =
      (this.configService.get<string>('SMTP_SECURE') ?? 'false').toLowerCase() ===
      'true';
    const smtpUser = this.configService.get<string>('SMTP_USER')?.trim();
    const smtpPass = this.configService.get<string>('SMTP_PASS') ?? undefined;
    const smtpFrom =
      this.configService.get<string>('SMTP_FROM')?.trim() ?? null;

    this.smtpHostConfig = smtpHost ?? null;
    this.smtpPortConfig = Number.isNaN(smtpPort) ? null : smtpPort;
    this.smtpSecureConfig = smtpSecure;
    this.smtpUserConfig = smtpUser ?? undefined;
    this.smtpPassConfig = smtpPass ?? undefined;

    if (smtpHost && smtpFrom) {
      this.emailTransporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number.isNaN(smtpPort) ? 587 : smtpPort,
        secure: smtpSecure,
        auth:
          smtpUser && smtpPass
            ? {
                user: smtpUser,
                pass: smtpPass,
              }
            : undefined,
        connectionTimeout: 10000,
        socketTimeout: 10000,
      });
      this.emailFrom = smtpFrom;
      this.emailEnabled = true;
    } else {
      this.emailTransporter = null;
      this.emailFrom = null;
      this.emailEnabled = false;
      this.logger.warn(
        `Email notifications disabled: SMTP_HOST=${smtpHost ? '✓' : '✗'}, SMTP_FROM=${smtpFrom ? '✓' : '✗'}`,
      );
    }

    const vapidPublicKey = this.configService
      .get<string>('WEB_PUSH_PUBLIC_KEY')
      ?.trim();
    const vapidPrivateKey = this.configService
      .get<string>('WEB_PUSH_PRIVATE_KEY')
      ?.trim();
    const vapidSubject =
      this.configService.get<string>('WEB_PUSH_SUBJECT')?.trim() ??
      'mailto:no-reply@example.com';

    if (vapidPublicKey && vapidPrivateKey) {
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
      this.pushEnabled = true;
    } else {
      this.pushEnabled = false;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.ensurePushSubscriptionSchema();
  }

  async upsertPushSubscription(
    userId: string,
    dto: UpsertPushSubscriptionDto,
  ): Promise<void> {
    await this.databaseService.query(
      `
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        updated_at = now()
      `,
      [userId, dto.endpoint, dto.keys.p256dh, dto.keys.auth],
    );
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<void> {
    await this.databaseService.query(
      `
      DELETE FROM push_subscriptions
      WHERE user_id = $1
        AND endpoint = $2
      `,
      [userId, endpoint],
    );
  }

  async notifyAudienceAnnouncementPublished(input: {
    announcementId: string;
    title: string;
    body: string;
    author: string;
    audienceType: NotificationAudienceType;
    audienceRoles: AppRole[];
  }): Promise<void> {
    const recipients = await this.findAudienceRecipients(
      input.audienceType,
      input.audienceRoles,
    );

    if (recipients.length === 0) {
      return;
    }

    const subject = `New announcement: ${input.title}`;
    const template: EmailTemplateInput = {
      preheader: `${input.author} just shared a new announcement.`,
      heading: input.title,
      eyebrow: 'Announcement',
      paragraphs: [
        `${input.author} just published a new announcement for the association.`,
        input.body,
      ],
      cta: {
        label: 'Open announcements',
        url: `${this.resolveFrontendBaseUrl()}/announcements`,
      },
      footnote: 'Sign in to read, react, or follow up on this announcement.',
    };

    const pushPayload = {
      title: 'New Announcement',
      body: `${input.title} - ${input.author}`,
      url: '/announcements',
      announcementId: input.announcementId,
    };

    await Promise.all([
      this.sendTemplatedEmail(recipients, subject, template),
      this.sendPush(recipients, pushPayload),
    ]);
  }

  async notifyPresidentsApprovalNeeded(input: {
    announcementId: string;
    title: string;
    author: string;
    authorRole: AppRole;
  }): Promise<void> {
    const presidents = await this.findRecipientsByRoles(['president']);
    if (presidents.length === 0) {
      return;
    }

    const subject = `Approval needed: ${input.title}`;
    const template: EmailTemplateInput = {
      preheader: `${input.author} submitted an announcement draft for approval.`,
      heading: 'Announcement awaiting approval',
      eyebrow: 'Approval needed',
      paragraphs: [
        'A new announcement draft has been submitted and is waiting for your review before it can be published.',
      ],
      details: [
        { label: 'Title', value: input.title },
        { label: 'Submitted by', value: `${input.author} (${input.authorRole})` },
      ],
      cta: {
        label: 'Review announcement',
        url: `${this.resolveFrontendBaseUrl()}/announcements`,
      },
    };

    const pushPayload = {
      title: 'Announcement Approval Needed',
      body: `${input.author} submitted: ${input.title}`,
      url: '/announcements',
      announcementId: input.announcementId,
    };

    await Promise.all([
      this.sendTemplatedEmail(presidents, subject, template),
      this.sendPush(presidents, pushPayload),
    ]);
  }

  async notifyMemberCredentials(input: {
    email: string;
    fullName: string;
    password: string;
  }): Promise<void> {
    const loginUrl = `${this.resolveFrontendBaseUrl()}/login`;
    const subject = 'Welcome to CEP Tumba — your account is ready';
    const template: EmailTemplateInput = {
      preheader: 'Your CEP Tumba account has been created.',
      heading: 'Welcome aboard',
      eyebrow: 'Account created',
      greeting: `Hello ${input.fullName},`,
      paragraphs: [
        'An account has been created for you on the CEP Tumba Association Management System.',
        'For your security, please sign in using the temporary password below and update it from your profile immediately after.',
      ],
      details: [
        { label: 'Login email', value: input.email },
        { label: 'Temporary password', value: input.password },
      ],
      cta: { label: 'Sign in now', url: loginUrl },
      footnote:
        'If you did not expect this email, please ignore it or contact the association leadership.',
    };

    await this.sendTemplatedEmail(
      [
        {
          id: 'member-credentials',
          email: input.email,
          display_name: input.fullName,
          role: 'member',
        },
      ],
      subject,
      template,
    );
  }

  async notifyEventCreated(input: {
    eventId: string;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: string;
    endsAt: string | null;
    organizer: string;
  }): Promise<void> {
    const recipients = await this.findAllActiveRecipients();
    if (recipients.length === 0) return;

    const subject = `New event: ${input.title}`;
    const details: { label: string; value: string }[] = [
      { label: 'When', value: this.formatDateRange(input.startsAt, input.endsAt) },
    ];
    if (input.location) details.push({ label: 'Location', value: input.location });
    details.push({ label: 'Organizer', value: input.organizer });

    const paragraphs = [
      `${input.organizer} has scheduled a new event for the association. We'd love to see you there.`,
    ];
    if (input.description) paragraphs.push(input.description);

    const template: EmailTemplateInput = {
      preheader: `${input.title} on ${this.formatDateShort(input.startsAt)}`,
      heading: input.title,
      eyebrow: 'Upcoming event',
      paragraphs,
      details,
      cta: {
        label: 'View event details',
        url: `${this.resolveFrontendBaseUrl()}/events`,
      },
    };

    await Promise.all([
      this.sendTemplatedEmail(recipients, subject, template),
      this.sendPush(recipients, {
        title: 'New Event',
        body: `${input.title} - ${this.formatDateShort(input.startsAt)}`,
        url: '/events',
        eventId: input.eventId,
      }),
    ]);
  }

  async notifyRequestSubmitted(input: {
    requestId: string;
    type: string;
    title: string;
    requesterName: string;
    requesterRole: string;
    reviewerRoles: AppRole[];
  }): Promise<void> {
    const recipients = await this.findRecipientsByRoles(input.reviewerRoles);
    if (recipients.length === 0) return;

    const subject = `New request: ${input.title}`;
    const template: EmailTemplateInput = {
      preheader: `${input.requesterName} submitted a new ${this.humanize(input.type)} request.`,
      heading: 'New request submitted',
      eyebrow: this.humanize(input.type),
      paragraphs: [
        'A new request has been submitted and needs your review.',
      ],
      details: [
        { label: 'Title', value: input.title },
        { label: 'Type', value: this.humanize(input.type) },
        {
          label: 'Submitted by',
          value: `${input.requesterName} (${this.humanize(input.requesterRole)})`,
        },
      ],
      cta: {
        label: 'Review request',
        url: `${this.resolveFrontendBaseUrl()}/requests`,
      },
    };

    await Promise.all([
      this.sendTemplatedEmail(recipients, subject, template),
      this.sendPush(recipients, {
        title: 'New Request',
        body: `${input.requesterName}: ${input.title}`,
        url: '/requests',
        requestId: input.requestId,
      }),
    ]);
  }

  async notifyRequestStatusChanged(input: {
    requestId: string;
    title: string;
    status: string;
    reviewerName: string;
    reviewNote: string | null;
    requesterUserId: string | null;
    requesterEmail: string | null;
    requesterName: string;
  }): Promise<void> {
    const recipient = await this.findRecipientByUserIdOrEmail(
      input.requesterUserId,
      input.requesterEmail,
      input.requesterName,
    );
    if (!recipient) return;

    const subject = `Your request was ${input.status}: ${input.title}`;
    const details: { label: string; value: string }[] = [
      { label: 'Title', value: input.title },
      { label: 'Status', value: this.humanize(input.status) },
      { label: 'Reviewed by', value: input.reviewerName },
    ];
    if (input.reviewNote && input.reviewNote.trim().length > 0) {
      details.push({ label: 'Reviewer note', value: input.reviewNote });
    }

    const template: EmailTemplateInput = {
      preheader: `Your request was ${input.status}.`,
      heading: 'Request status updated',
      eyebrow: this.humanize(input.status),
      greeting: `Hello ${input.requesterName},`,
      paragraphs: [
        `Your request "${input.title}" has been ${input.status} by ${input.reviewerName}.`,
      ],
      details,
      cta: {
        label: 'Open my request',
        url: `${this.resolveFrontendBaseUrl()}/requests`,
      },
    };

    await this.sendTemplatedEmail([recipient], subject, template);
    if (input.requesterUserId) {
      await this.sendPush(
        [
          {
            id: input.requesterUserId,
            email: recipient.email,
            display_name: recipient.display_name,
            role: recipient.role,
          },
        ],
        {
          title: 'Request Updated',
          body: `${input.title} — ${input.status}`,
          url: '/requests',
          requestId: input.requestId,
        },
      );
    }
  }

  async notifyWelfareCaseOpened(input: {
    caseId: string;
    title: string;
    type: string;
    urgency: string;
    memberName: string;
    openedBy: string;
  }): Promise<void> {
    const recipients = await this.findRecipientsByRoles([
      'president',
      'vp_social',
      'advisor_social',
      'secretary',
    ]);
    if (recipients.length === 0) return;

    const subject = `New welfare case: ${input.title}`;
    const template: EmailTemplateInput = {
      preheader: `${input.urgency.toUpperCase()} priority — ${input.memberName}`,
      heading: 'Welfare case opened',
      eyebrow: this.humanize(input.type),
      paragraphs: [
        `${input.openedBy} has opened a new welfare case that needs the team's attention.`,
      ],
      details: [
        { label: 'Title', value: input.title },
        { label: 'Member', value: input.memberName },
        { label: 'Type', value: this.humanize(input.type) },
        { label: 'Urgency', value: this.humanize(input.urgency) },
        { label: 'Opened by', value: input.openedBy },
      ],
      cta: {
        label: 'Open welfare case',
        url: `${this.resolveFrontendBaseUrl()}/welfare`,
      },
    };

    await Promise.all([
      this.sendTemplatedEmail(recipients, subject, template),
      this.sendPush(recipients, {
        title: 'New Welfare Case',
        body: `${input.memberName}: ${input.title}`,
        url: '/welfare',
        caseId: input.caseId,
      }),
    ]);
  }

  async notifyPrayerRequestCreated(input: {
    requestId: string;
    title: string;
    requesterName: string;
    isPrivate: boolean;
  }): Promise<void> {
    const recipients = await this.findRecipientsByRoles([
      'president',
      'vp_prayers',
      'advisor_prayers',
    ]);
    if (recipients.length === 0) return;

    const subject = `New prayer request: ${input.title}`;
    const template: EmailTemplateInput = {
      preheader: input.isPrivate
        ? 'A confidential prayer request was submitted.'
        : `${input.requesterName} submitted a new prayer request.`,
      heading: 'New prayer request',
      eyebrow: input.isPrivate ? 'Confidential' : 'Prayer request',
      paragraphs: [
        input.isPrivate
          ? 'A confidential prayer request was submitted. Please follow up with care and discretion.'
          : `${input.requesterName} has shared a new prayer request with the team.`,
      ],
      details: [
        { label: 'Title', value: input.title },
        { label: 'Submitted by', value: input.requesterName },
        { label: 'Privacy', value: input.isPrivate ? 'Private' : 'Shared' },
      ],
      cta: {
        label: 'Open prayer center',
        url: `${this.resolveFrontendBaseUrl()}/prayer-center`,
      },
    };

    await Promise.all([
      this.sendTemplatedEmail(recipients, subject, template),
      this.sendPush(recipients, {
        title: 'New Prayer Request',
        body: input.isPrivate ? 'Confidential request' : input.title,
        url: '/prayer-center',
        requestId: input.requestId,
      }),
    ]);
  }

  async notifyDevotionPublished(input: {
    devotionId: string;
    title: string;
    summary: string | null;
    author: string;
    scriptureReference: string | null;
  }): Promise<void> {
    const recipients = await this.findAllActiveRecipients();
    if (recipients.length === 0) return;

    const subject = `New devotion: ${input.title}`;
    const details: { label: string; value: string }[] = [
      { label: 'Author', value: input.author },
    ];
    if (input.scriptureReference) {
      details.push({ label: 'Scripture', value: input.scriptureReference });
    }

    const paragraphs: string[] = [
      `${input.author} just published a new devotion for the fellowship.`,
    ];
    if (input.summary) paragraphs.push(input.summary);

    const template: EmailTemplateInput = {
      preheader: input.summary ?? `Devotion by ${input.author}`,
      heading: input.title,
      eyebrow: 'Devotion',
      paragraphs,
      details,
      cta: {
        label: 'Read devotion',
        url: `${this.resolveFrontendBaseUrl()}/devotion`,
      },
    };

    await Promise.all([
      this.sendTemplatedEmail(recipients, subject, template),
      this.sendPush(recipients, {
        title: 'New Devotion',
        body: `${input.title} - ${input.author}`,
        url: '/devotion',
        devotionId: input.devotionId,
      }),
    ]);
  }

  async notifyMinuteCreated(input: {
    minuteId: string;
    title: string;
    meetingDate: string | null;
    author: string;
  }): Promise<void> {
    const recipients = await this.findRecipientsByRoles([
      'president',
      'secretary',
      'advisor_prayers',
      'advisor_social',
      'vp_prayers',
      'vp_social',
      'accountant',
    ]);
    if (recipients.length === 0) return;

    const subject = `Meeting minutes: ${input.title}`;
    const details: { label: string; value: string }[] = [
      { label: 'Author', value: input.author },
    ];
    if (input.meetingDate) {
      details.push({
        label: 'Meeting date',
        value: this.formatDateShort(input.meetingDate),
      });
    }

    const template: EmailTemplateInput = {
      preheader: `${input.author} added new meeting minutes.`,
      heading: input.title,
      eyebrow: 'Meeting minutes',
      paragraphs: [
        `${input.author} just added new meeting minutes. Please review the resolutions and your assigned action items.`,
      ],
      details,
      cta: {
        label: 'Open minutes',
        url: `${this.resolveFrontendBaseUrl()}/minutes`,
      },
    };

    await Promise.all([
      this.sendTemplatedEmail(recipients, subject, template),
      this.sendPush(recipients, {
        title: 'New Meeting Minutes',
        body: input.title,
        url: '/minutes',
        minuteId: input.minuteId,
      }),
    ]);
  }

  async notifyMessageCreated(input: {
    conversationId: string;
    senderId: string;
    senderName: string;
    senderRole: AppRole | null;
    body: string;
    hasAttachment: boolean;
    recipientIds: string[];
  }): Promise<void> {
    const recipientIds = input.recipientIds.filter((id) => id !== input.senderId);
    if (recipientIds.length === 0) {
      return;
    }

    const recipients = await this.databaseService.query<NotificationRecipientRow>(
      `
      SELECT id, email, display_name, role
      FROM users
      WHERE is_active = true
        AND id = ANY($1::uuid[])
      `,
      [recipientIds],
    );

    if (recipients.rowCount === 0) {
      return;
    }

    const preview = this.buildMessagePreview(input.body, input.hasAttachment);
    await this.sendPush(recipients.rows, {
      title: 'New message',
      body: `${input.senderName}${input.senderRole ? ` (${input.senderRole})` : ''}: ${preview}`,
      url: `/messages?conversationId=${encodeURIComponent(input.conversationId)}`,
      conversationId: input.conversationId,
      senderId: input.senderId,
    });
  }

  private async findAudienceRecipients(
    audienceType: NotificationAudienceType,
    audienceRoles: AppRole[],
  ): Promise<NotificationRecipientRow[]> {
    if (audienceType === 'all') {
      return this.findAllActiveRecipients();
    }

    if (audienceType === 'leaders_only') {
      return this.findRecipientsByRoles(LEADER_ROLES);
    }

    if (audienceRoles.length === 0) {
      return [];
    }

    return this.findRecipientsByRoles(audienceRoles);
  }

  private async findAllActiveRecipients(): Promise<NotificationRecipientRow[]> {
    const result = await this.databaseService.query<NotificationRecipientRow>(
      `
      SELECT id, email, display_name, role
      FROM users
      WHERE is_active = true
      `,
    );

    return result.rows;
  }

  private async findRecipientsByRoles(
    roles: AppRole[],
  ): Promise<NotificationRecipientRow[]> {
    if (roles.length === 0) {
      return [];
    }

    const result = await this.databaseService.query<NotificationRecipientRow>(
      `
      SELECT id, email, display_name, role
      FROM users
      WHERE is_active = true
        AND role = ANY($1::app_role[])
      `,
      [roles],
    );

    return result.rows;
  }

  private async sendEmail(
    recipients: NotificationRecipientRow[],
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    const fromAddress = this.emailFrom;
      if (!this.emailEnabled || !this.emailTransporter || !fromAddress) {
        this.logger.debug(
          `Email send skipped for "${subject}": emailEnabled=${this.emailEnabled}, transporter=${!!this.emailTransporter}, fromAddress=${!!fromAddress}`,
        );
      return;
    }

    const settled = await Promise.allSettled(
      recipients.map((recipient) =>
        this.emailTransporter?.sendMail({
          from: fromAddress,
          to: recipient.email,
          subject,
          text,
          html,
        }),
      ),
    );

    const failures = settled.filter((item) => item.status === 'rejected');
    if (failures.length > 0) {
      const reasons = failures.map((f) => (f as PromiseRejectedResult).reason);

      // If failure is ENETUNREACH (IPv6 unreachable), attempt IPv4 fallback.
      const enetFailures: number[] = [];
      settled.forEach((s, idx) => {
        if (s.status === 'rejected') {
          const r = (s as PromiseRejectedResult).reason;
          const msg = String(r);
          const code = (r && (r as any).code) || null;
          if (code === 'ENETUNREACH' || /ENETUNREACH/.test(msg)) {
            enetFailures.push(idx);
          }
        }
      });

      if (enetFailures.length > 0 && this.smtpHostConfig) {
        try {
          const aRecords = await dns.resolve4(this.smtpHostConfig);
          if (aRecords && aRecords.length > 0) {
            const ipv4 = aRecords[0];
            this.logger.warn(
              `ENETUNREACH detected — retrying ${enetFailures.length} email(s) using IPv4 address ${ipv4}`,
            );

            const fallbackTransport = nodemailer.createTransport({
              host: ipv4,
              port: this.smtpPortConfig ?? 587,
              secure: this.smtpSecureConfig,
              auth:
                this.smtpUserConfig && this.smtpPassConfig
                  ? { user: this.smtpUserConfig, pass: this.smtpPassConfig }
                  : undefined,
              connectionTimeout: 10000,
              socketTimeout: 10000,
            });

            const retryPromises = enetFailures.map((i) => {
              const recipient = recipients[i];
              return fallbackTransport.sendMail({
                from: fromAddress,
                to: recipient.email,
                subject,
                text,
                html,
              });
            });

            const retrySettled = await Promise.allSettled(retryPromises);
            const retryFailures = retrySettled.filter((s) => s.status === 'rejected');
            if (retryFailures.length > 0) {
              this.logger.error(
                `IPv4 retry still failed for ${retryFailures.length}/${enetFailures.length} recipients: ${retryFailures
                  .map((f) => (f as PromiseRejectedResult).reason)
                  .join('; ')}`,
              );
            } else {
              this.logger.log(
                `IPv4 retry succeeded for ${enetFailures.length} recipient(s)`,
              );
            }
          }
        } catch (err) {
          this.logger.error(`IPv4 fallback failed: ${String(err)}`);
        }
      }

      this.logger.error(
        `Email "${subject}" had ${failures.length}/${recipients.length} failed deliveries: ${reasons.join('; ')}`,
      );
    } else if (recipients.length > 0) {
      this.logger.debug(
        `Email "${subject}" sent successfully to ${recipients.length} recipients`,
      );
    }
  }

  private async sendTemplatedEmail(
    recipients: NotificationRecipientRow[],
    subject: string,
    template: EmailTemplateInput,
  ): Promise<void> {
    if (recipients.length === 0) return;
    const html = renderEmail(template);
    const text = renderEmailPlainText(template);
    await this.sendEmail(recipients, subject, text, html);
  }

  private async findRecipientByUserIdOrEmail(
    userId: string | null,
    email: string | null,
    fallbackName: string,
  ): Promise<NotificationRecipientRow | null> {
    if (userId) {
      const result = await this.databaseService.query<NotificationRecipientRow>(
        `SELECT id, email, display_name, role
         FROM users
         WHERE id = $1 AND is_active = true AND email IS NOT NULL
         LIMIT 1`,
        [userId],
      );
      if (result.rows[0]) return result.rows[0];
    }
    if (email) {
      const result = await this.databaseService.query<NotificationRecipientRow>(
        `SELECT id, email, display_name, role
         FROM users
         WHERE lower(email) = lower($1) AND is_active = true
         LIMIT 1`,
        [email],
      );
      if (result.rows[0]) return result.rows[0];
      // No user account, but we still have an email — synthesize a recipient.
      return {
        id: 'anonymous',
        email,
        display_name: fallbackName,
        role: 'member',
      };
    }
    return null;
  }

  private humanize(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private formatDateShort(value: string): string {
    const date = parseDateOnly(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  private formatDateRange(start: string, end: string | null): string {
    const startDate = parseDateOnly(start);
    if (Number.isNaN(startDate.getTime())) return start;
    const startStr = startDate.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    if (!end) return startStr;
    const endDate = parseDateOnly(end);
    if (Number.isNaN(endDate.getTime())) return startStr;
    const sameDay = startDate.toDateString() === endDate.toDateString();
    const endStr = sameDay
      ? endDate.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' })
      : endDate.toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    return `${startStr} – ${endStr}`;
  }

  private async sendPush(
    recipients: NotificationRecipientRow[],
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.pushEnabled || recipients.length === 0) {
      return;
    }

    const userIds = recipients.map((recipient) => recipient.id);
    const subscriptionsResult =
      await this.databaseService.query<PushSubscriptionRow>(
        `
        SELECT id, user_id, endpoint, p256dh, auth
        FROM push_subscriptions
        WHERE user_id = ANY($1::uuid[])
        `,
        [userIds],
      );

    if (subscriptionsResult.rows.length === 0) {
      return;
    }

    const pushPayload = JSON.stringify(payload);

    const settled = await Promise.allSettled(
      subscriptionsResult.rows.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            pushPayload,
          );
        } catch (error) {
          const maybeError = error as { statusCode?: number; message?: string };
          if (maybeError.statusCode === 404 || maybeError.statusCode === 410) {
            await this.databaseService.query(
              `
              DELETE FROM push_subscriptions
              WHERE endpoint = $1
              `,
              [subscription.endpoint],
            );
            return;
          }

          throw error;
        }
      }),
    );

    const failures = settled.filter((item) => item.status === 'rejected');
    if (failures.length > 0) {
      this.logger.warn(
        `Push notifications had ${failures.length} failed deliveries`,
      );
    }
  }

  private async ensurePushSubscriptionSchema(): Promise<void> {
    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint text NOT NULL UNIQUE,
        p256dh text NOT NULL,
        auth text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
      ON push_subscriptions (user_id)
    `);

    this.activityLogService.logSystem({
      action: 'NOTIFICATIONS_SCHEMA_READY',
      metadata: {
        email_enabled: this.emailEnabled,
        push_enabled: this.pushEnabled,
      },
    });
  }

  private resolveFrontendBaseUrl(): string {
    const configuredOrigins =
      this.configService.get<string>('FRONTEND_URLS') ??
      this.configService.get<string>('FRONTEND_URL') ??
      'http://localhost:8081';

    const firstOrigin = configuredOrigins
      .split(',')
      .map((item) => item.trim())
      .find((item) => item.length > 0);

    return (firstOrigin ?? 'http://localhost:8081').replace(/\/$/, '');
  }

  private buildMessagePreview(body: string, hasAttachment: boolean): string {
    const text = (body ?? '').trim();
    if (text.length > 0) {
      return text.length > 120 ? `${text.slice(0, 117)}...` : text;
    }

    return hasAttachment ? 'Sent an attachment' : 'New message';
  }

  async sendPasswordResetEmail(input: {
    to: string;
    name: string;
    resetUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    if (!this.emailEnabled) {
      this.logger.warn(
        `Password reset email skipped (email disabled). User would have received: ${input.resetUrl}`,
      );
      return;
    }

    const recipient: NotificationRecipientRow = {
      id: 'password-reset',
      email: input.to,
      display_name: input.name || input.to,
      role: 'member',
    };

    const minutes = Math.max(
      1,
      Math.round((input.expiresAt.getTime() - Date.now()) / 60_000),
    );
    const subject = 'Reset your FaithHub password';
    const text =
      `Hi ${recipient.display_name},\n\n` +
      `We received a request to reset the password for your FaithHub account (${input.to}).\n\n` +
      `Open this link to choose a new password (it expires in ${minutes} minute(s)):\n` +
      `${input.resetUrl}\n\n` +
      `If you did not request this, you can safely ignore this email — your password will not change.\n\n` +
      `— FaithHub`;
    const html =
      `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;">` +
      `<h2 style="margin:0 0 12px;">Reset your password</h2>` +
      `<p>Hi ${this.escapeHtml(recipient.display_name)},</p>` +
      `<p>We received a request to reset the password for your FaithHub account ` +
      `(<strong>${this.escapeHtml(input.to)}</strong>).</p>` +
      `<p style="margin:24px 0;"><a href="${input.resetUrl}" ` +
      `style="display:inline-block;background:#1E3A8A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">` +
      `Reset password</a></p>` +
      `<p style="font-size:13px;color:#475569;">This link expires in <strong>${minutes} minute(s)</strong>. ` +
      `If you did not request a reset, you can safely ignore this email.</p>` +
      `<p style="font-size:13px;color:#475569;">If the button does not work, copy and paste this URL:<br>` +
      `<span style="word-break:break-all;">${this.escapeHtml(input.resetUrl)}</span></p>` +
      `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">` +
      `<p style="font-size:12px;color:#94a3b8;">FaithHub Association Management</p>` +
      `</div>`;

    await this.sendEmail([recipient], subject, text, html);
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
