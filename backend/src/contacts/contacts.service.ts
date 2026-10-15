import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import * as nodemailer from 'nodemailer';

const CONTACT_VIEWER_ROLES = ['president', 'secretary'];

@Injectable()
export class ContactsService {
  private transporter: nodemailer.Transporter | null = null;

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private toHtmlParagraph(value: string): string {
    return this.escapeHtml(value).replace(/\n/g, '<br/>');
  }

  private buildEmailTemplate(params: {
    appName: string;
    title: string;
    greeting: string;
    intro: string;
    details?: Array<{ label: string; value: string }>;
    body?: string;
    closing?: string;
  }): string {
    const detailsHtml = (params.details ?? [])
      .map(
        (item) => `
          <tr>
            <td style="padding: 6px 0; color: #475569; font-size: 14px; width: 120px; vertical-align: top;"><strong>${this.escapeHtml(item.label)}:</strong></td>
            <td style="padding: 6px 0; color: #0f172a; font-size: 14px;">${this.toHtmlParagraph(item.value)}</td>
          </tr>
        `,
      )
      .join('');

    const bodyHtml = params.body
      ? `<div style="margin-top: 14px; padding: 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; color: #0f172a; font-size: 14px; line-height: 1.6;">${this.toHtmlParagraph(params.body)}</div>`
      : '';

    const closingHtml = params.closing
      ? `<p style="margin: 18px 0 0; color: #334155; font-size: 14px; line-height: 1.6;">${this.toHtmlParagraph(params.closing)}</p>`
      : '';

    return `
      <div style="margin: 0; padding: 24px; background: #eef2f7; font-family: 'Segoe UI', Tahoma, sans-serif;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden;">
          <tr>
            <td style="padding: 18px 22px; background: linear-gradient(135deg, #0f766e, #115e59); color: #ffffff;">
              <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; opacity: 0.9;">${this.escapeHtml(params.appName)}</div>
              <h2 style="margin: 6px 0 0; font-size: 20px; line-height: 1.3;">${this.escapeHtml(params.title)}</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 22px;">
              <p style="margin: 0; color: #0f172a; font-size: 14px; line-height: 1.7;">${this.toHtmlParagraph(params.greeting)}</p>
              <p style="margin: 12px 0 0; color: #334155; font-size: 14px; line-height: 1.7;">${this.toHtmlParagraph(params.intro)}</p>
              ${detailsHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 14px;">${detailsHtml}</table>` : ''}
              ${bodyHtml}
              ${closingHtml}
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  constructor(private readonly databaseService: DatabaseService) {
    // initialize transporter if SMTP env is present
    try {
      const host = process.env.SMTP_HOST;
      const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
      const secure = process.env.SMTP_SECURE === 'true';
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      if (host && port && user && pass) {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: !!secure,
          auth: { user, pass },
        });
      }
    } catch (err) {
      // don't crash app if nodemailer fails to initialize
      console.error('Failed to initialize SMTP transporter', err);
      this.transporter = null;
    }
  }

  async ensureTable(): Promise<void> {
    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        email citext,
        subject text,
        message text NOT NULL,
        is_replied boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    // Add is_replied column if it doesn't exist (migration for existing tables)
    await this.databaseService.query(`
      ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS is_replied boolean NOT NULL DEFAULT false
    `);
    
    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS contact_replies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
        reply_text text NOT NULL,
        replied_by uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    
    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS idx_contact_replies_contact_id ON contact_replies(contact_id, created_at DESC)
    `);
  }

  async createContact(dto: CreateContactDto) {
    await this.ensureTable();
    const result = await this.databaseService.query(
      `INSERT INTO contacts (name, email, subject, message) VALUES ($1, $2, $3, $4) RETURNING id, name, email, subject, message, is_replied, created_at`,
      [dto.name.trim(), dto.email?.trim() ?? null, dto.subject?.trim() ?? null, dto.message.trim()],
    );

    const contact = result.rows[0];

    // Send confirmation email to submitter if email exists
    if (contact.email) {
      (async () => {
        try {
          if (!this.transporter) {
            console.warn('SMTP transporter not configured; skipping email send');
            return;
          }

          const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com';
          const appName = process.env.APP_NAME || 'CEP Tumba';
          const subject = `Your contact submission has been received`;
          const text = `Hello ${contact.name},\n\nThank you for contacting ${appName}. We have received your message and will get back to you soon.\n\nSubject: ${contact.subject || 'No subject'}\n\nBest regards,\n${appName} Team`;
          const html = this.buildEmailTemplate({
            appName,
            title: 'Contact Submission Received',
            greeting: `Hello ${contact.name},`,
            intro: `Thank you for contacting ${appName}. We have received your message and our team will respond as soon as possible.`,
            details: [{ label: 'Subject', value: contact.subject || 'No subject' }],
            closing: `Best regards,\n${appName} Team`,
          });

          await this.transporter.sendMail({
            from,
            to: contact.email,
            subject,
            text,
            html,
          });
          console.log(`Sent confirmation email to ${contact.email} for contact ${contact.id}`);
        } catch (err) {
          console.error(`Failed to send confirmation email to ${contact.email}:`, err instanceof Error ? err.message : err);
        }
      })();
    }

    return contact;
  }

  async listContacts(currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    if (!CONTACT_VIEWER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Insufficient role to view contacts');
    }
    await this.ensureTable();
    const result = await this.databaseService.query(
      `SELECT id, name, email, subject, message, is_replied, created_at FROM contacts ORDER BY created_at DESC`,
    );
    return result.rows;
  }

  async getReplies(contactId: string) {
    await this.ensureTable();
    const result = await this.databaseService.query(
      `SELECT cr.id, cr.reply_text, cr.created_at, u.display_name FROM contact_replies cr
       LEFT JOIN users u ON cr.replied_by = u.id
       WHERE cr.contact_id = $1 ORDER BY cr.created_at ASC`,
      [contactId],
    );
    return result.rows;
  }

  async createReply(contactId: string, replyText: string, currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    if (!CONTACT_VIEWER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Insufficient role to reply');
    }
    
    await this.ensureTable();
    
    // Verify contact exists
    const contactCheck = await this.databaseService.query(
      `SELECT email FROM contacts WHERE id = $1`,
      [contactId],
    );
    if (contactCheck.rowCount === 0) throw new Error('Contact not found');
    
    const contactEmail = contactCheck.rows[0].email;
    
    // Insert reply
    const result = await this.databaseService.query(
      `INSERT INTO contact_replies (contact_id, reply_text, replied_by) VALUES ($1, $2, $3)
       RETURNING id, contact_id, reply_text, created_at`,
      [contactId, replyText.trim(), currentUser.sub],
    );

    // Mark contact as replied
    await this.databaseService.query(
      `UPDATE contacts SET is_replied = true WHERE id = $1`,
      [contactId],
    );
    
    // Send email notification to contact submitter if email exists
    if (contactEmail) {
      // send email asynchronously, but don't block the API response
      (async () => {
        try {
          if (!this.transporter) {
            console.warn('SMTP transporter not configured; skipping email send');
            return;
          }

          const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com';
          const appName = process.env.APP_NAME || 'CEP Tumba';
          const subject = `Reply from ${appName} regarding your message`;
          const text = `Hello,\n\nA leader from ${appName} replied to your message:\n\n${replyText}\n\nBest regards,\n${appName} Team`;
          const html = this.buildEmailTemplate({
            appName,
            title: 'You Have a New Reply',
            greeting: 'Hello,',
            intro: `A leader from ${appName} has replied to your contact submission.`,
            body: replyText,
            closing: `Best regards,\n${appName} Team`,
          });

          await this.transporter.sendMail({
            from,
            to: contactEmail,
            subject,
            text,
            html,
          });
          console.log(`Sent reply email to ${contactEmail} for contact ${contactId}`);
        } catch (err) {
          console.error(`Failed to send reply email to ${contactEmail}:`, err instanceof Error ? err.message : err);
        }
      })();
    }
    
    return result.rows[0];
  }
}
