import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AppRole } from '../auth/auth-role.type';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { extname, join, resolve } from 'path';
import {
  AttachmentInput,
  ConversationSummary,
  LEADER_ROLES,
  MessageKind,
  MessageResponse,
  SystemGroupType,
  isLeader,
} from './messaging.types';

// Upload directory (relative to backend cwd) and public mount prefix.
export const MESSAGING_UPLOAD_DIR = resolve(process.cwd(), 'uploads', 'messaging');
export const MESSAGING_PUBLIC_PREFIX = '/uploads/messaging';

type ConversationRow = {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  is_system: boolean;
  system_group_type: SystemGroupType | null;
  created_by: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_name: string | null;
  sender_role: AppRole | null;
  message_type: MessageKind;
  body: string;
  attachment_url: string | null;
  attachment_type: string | null;
  attachment_name: string | null;
  attachment_size: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type AllowedUserRow = {
  id: string;
  display_name: string;
  email: string;
  role: AppRole;
};

@Injectable()
export class MessagingService implements OnModuleInit {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
    await this.bootstrapSystemGroups();
  }

  // -----------------------------
  // Schema bootstrap
  // -----------------------------
  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'conversation_type') THEN
          CREATE TYPE conversation_type AS ENUM ('direct', 'group');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_group_type') THEN
          CREATE TYPE system_group_type AS ENUM ('leaders', 'alumni');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_kind') THEN
          CREATE TYPE message_kind AS ENUM ('text', 'system');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        type conversation_type NOT NULL,
        name text,
        is_system boolean NOT NULL DEFAULT false,
        system_group_type system_group_type,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        last_message_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS conversations_system_unique
      ON conversations (system_group_type)
      WHERE system_group_type IS NOT NULL
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_in_conversation text NOT NULL DEFAULT 'member',
        joined_at timestamptz NOT NULL DEFAULT now(),
        last_read_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (conversation_id, user_id)
      )
    `);

    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS cp_user_idx ON conversation_participants(user_id)`,
    );

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
        message_type message_kind NOT NULL DEFAULT 'text',
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);

    // Idempotent attachment + edit support columns
    await this.databaseService.query(`
      ALTER TABLE messages
        ADD COLUMN IF NOT EXISTS attachment_url text,
        ADD COLUMN IF NOT EXISTS attachment_type text,
        ADD COLUMN IF NOT EXISTS attachment_name text,
        ADD COLUMN IF NOT EXISTS attachment_size integer,
        ADD COLUMN IF NOT EXISTS edited_at timestamptz
    `);
    await this.databaseService.query(`
      ALTER TABLE messages ALTER COLUMN body DROP NOT NULL
    `);

    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at DESC)`,
    );
  }

  // -----------------------------
  // System group bootstrap
  // -----------------------------
  async bootstrapSystemGroups(): Promise<void> {
    await this.ensureSystemGroup('leaders', 'Leaders Group');
    await this.ensureSystemGroup('alumni', 'Alumni Group');
    await this.syncSystemGroupParticipants();
  }

  private async ensureSystemGroup(type: SystemGroupType, name: string): Promise<void> {
    await this.databaseService.query(
      `
      INSERT INTO conversations (type, name, is_system, system_group_type)
      VALUES ('group', $1, true, $2::system_group_type)
      ON CONFLICT DO NOTHING
      `,
      [name, type],
    );
  }

  /**
   * Sync system group memberships:
   *  - Alumni Group: all users
   *  - Leaders Group: only users with leader roles
   */
  async syncSystemGroupParticipants(): Promise<void> {
    // Alumni group: include every user
    await this.databaseService.query(
      `
      INSERT INTO conversation_participants (conversation_id, user_id)
      SELECT c.id, u.id
      FROM conversations c
      CROSS JOIN users u
      WHERE c.system_group_type = 'alumni'
        AND u.is_active = true
      ON CONFLICT (conversation_id, user_id) DO NOTHING
      `,
    );

    // Leaders group: include only leaders
    await this.databaseService.query(
      `
      INSERT INTO conversation_participants (conversation_id, user_id)
      SELECT c.id, u.id
      FROM conversations c
      CROSS JOIN users u
      WHERE c.system_group_type = 'leaders'
        AND u.is_active = true
        AND u.role = ANY($1::app_role[])
      ON CONFLICT (conversation_id, user_id) DO NOTHING
      `,
      [LEADER_ROLES],
    );

    // Remove non-leaders from leaders group (in case role changed)
    await this.databaseService.query(
      `
      DELETE FROM conversation_participants cp
      USING conversations c, users u
      WHERE cp.conversation_id = c.id
        AND cp.user_id = u.id
        AND c.system_group_type = 'leaders'
        AND NOT (u.role = ANY($1::app_role[]))
      `,
      [LEADER_ROLES],
    );
  }

  // -----------------------------
  // Authorization helpers
  // -----------------------------
  private async getUserOrFail(
    userId: string,
  ): Promise<{ id: string; display_name: string; email: string; role: AppRole }> {
    const result = await this.databaseService.query<{
      id: string;
      display_name: string;
      email: string;
      role: AppRole;
    }>(`SELECT id, display_name, email, role FROM users WHERE id = $1`, [userId]);
    if (result.rowCount === 0) throw new NotFoundException('User not found');
    return result.rows[0];
  }

  private canDirectMessage(roleA: AppRole, roleB: AppRole): boolean {
    // At least one must be a leader (members cannot DM each other)
    return isLeader(roleA) || isLeader(roleB);
  }

  private async ensureParticipant(conversationId: string, userId: string): Promise<void> {
    const result = await this.databaseService.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    if (result.rowCount === 0) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }
  }

  // -----------------------------
  // Conversation listing
  // -----------------------------
  async listConversations(userId: string): Promise<ConversationSummary[]> {
    const result = await this.databaseService.query<{
      id: string;
      type: 'direct' | 'group';
      name: string | null;
      is_system: boolean;
      system_group_type: SystemGroupType | null;
      last_message_at: string | null;
      created_at: string;
      updated_at: string;
      participants_count: string;
      last_read_at: string | null;
      unread_count: string;
      peer_id: string | null;
      peer_name: string | null;
      peer_email: string | null;
      peer_role: AppRole | null;
      last_message_id: string | null;
      last_message_body: string | null;
      last_message_sender_id: string | null;
      last_message_sender_name: string | null;
      last_message_created_at: string | null;
      last_message_type: MessageKind | null;
    }>(
      `
      WITH user_convs AS (
        SELECT cp.conversation_id, cp.last_read_at
        FROM conversation_participants cp
        WHERE cp.user_id = $1
      )
      SELECT
        c.id,
        c.type::text AS type,
        c.name,
        c.is_system,
        c.system_group_type,
        c.last_message_at,
        c.created_at,
        c.updated_at,
        uc.last_read_at,
        (SELECT COUNT(*) FROM conversation_participants p WHERE p.conversation_id = c.id) AS participants_count,
        (SELECT COUNT(*) FROM messages m
          WHERE m.conversation_id = c.id
            AND m.deleted_at IS NULL
            AND m.sender_id IS DISTINCT FROM $1
            AND (uc.last_read_at IS NULL OR m.created_at > uc.last_read_at)
        ) AS unread_count,
        peer.id AS peer_id,
        peer.display_name AS peer_name,
        peer.email AS peer_email,
        peer.role AS peer_role,
        lm.id AS last_message_id,
        lm.body AS last_message_body,
        lm.sender_id AS last_message_sender_id,
        sender.display_name AS last_message_sender_name,
        lm.created_at AS last_message_created_at,
        lm.message_type::text AS last_message_type
      FROM user_convs uc
      JOIN conversations c ON c.id = uc.conversation_id
      LEFT JOIN LATERAL (
        SELECT u.id, u.display_name, u.email, u.role
        FROM conversation_participants cp2
        JOIN users u ON u.id = cp2.user_id
        WHERE cp2.conversation_id = c.id
          AND cp2.user_id <> $1
          AND c.type = 'direct'
        LIMIT 1
      ) peer ON TRUE
      LEFT JOIN LATERAL (
        SELECT id, body, sender_id, message_type, created_at
        FROM messages
        WHERE conversation_id = c.id AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      ) lm ON TRUE
      LEFT JOIN users sender ON sender.id = lm.sender_id
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
      `,
      [userId],
    );

    return result.rows.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      isSystem: r.is_system,
      systemGroupType: r.system_group_type,
      lastMessageAt: r.last_message_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      peer:
        r.peer_id && r.peer_name && r.peer_email && r.peer_role
          ? { id: r.peer_id, name: r.peer_name, email: r.peer_email, role: r.peer_role }
          : null,
      participantsCount: Number(r.participants_count) || 0,
      lastReadAt: r.last_read_at,
      unreadCount: Number(r.unread_count) || 0,
      lastMessage: r.last_message_id
        ? {
            id: r.last_message_id,
            body: r.last_message_body ?? '',
            senderId: r.last_message_sender_id,
            senderName: r.last_message_sender_name,
            createdAt: r.last_message_created_at as string,
            type: (r.last_message_type as MessageKind) ?? 'text',
          }
        : null,
    }));
  }

  // -----------------------------
  // Direct chat: find-or-create
  // -----------------------------
  async findOrCreateDirectChat(
    userId: string,
    userRole: AppRole,
    targetUserId: string,
  ): Promise<{ id: string }> {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot start a chat with yourself');
    }

    const target = await this.getUserOrFail(targetUserId);

    if (!this.canDirectMessage(userRole, target.role)) {
      throw new ForbiddenException(
        'Direct messaging between members is not allowed. Members may only DM leaders.',
      );
    }

    // Look for existing direct conversation between the two users
    const existing = await this.databaseService.query<{ id: string }>(
      `
      SELECT c.id
      FROM conversations c
      JOIN conversation_participants p1 ON p1.conversation_id = c.id AND p1.user_id = $1
      JOIN conversation_participants p2 ON p2.conversation_id = c.id AND p2.user_id = $2
      WHERE c.type = 'direct'
      LIMIT 1
      `,
      [userId, targetUserId],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return { id: existing.rows[0].id };
    }

    return this.databaseService.withTransaction(async (client) => {
      const conv = await client.query<{ id: string }>(
        `INSERT INTO conversations (type, created_by) VALUES ('direct', $1) RETURNING id`,
        [userId],
      );
      const conversationId = conv.rows[0].id;

      await client.query(
        `INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`,
        [conversationId, userId, targetUserId],
      );

      this.activityLogService.logSystem({
        action: `MESSAGING_DM_CREATED: ${conversationId}`,
        metadata: { conversation_id: conversationId, by: userId, with: targetUserId },
      });

      return { id: conversationId };
    });
  }

  // -----------------------------
  // Send message
  // -----------------------------
  async sendMessage(
    conversationId: string,
    senderId: string,
    body: string,
    attachment?: AttachmentInput | null,
  ): Promise<{ message: MessageResponse; participantIds: string[] }> {
    const trimmed = (body ?? '').trim();
    if (!trimmed && !attachment) {
      throw new BadRequestException('Message body or attachment is required');
    }

    await this.ensureParticipant(conversationId, senderId);

    const result = await this.databaseService.withTransaction(async (client) => {
      const inserted = await client.query<MessageRow>(
        `
        WITH inserted AS (
          INSERT INTO messages (
            conversation_id, sender_id, message_type, body,
            attachment_url, attachment_type, attachment_name, attachment_size
          )
          VALUES ($1, $2, 'text', $3, $4, $5, $6, $7)
          RETURNING *
        )
        SELECT i.id, i.conversation_id, i.sender_id, u.display_name AS sender_name,
               u.role AS sender_role, i.message_type::text AS message_type,
               i.body, i.attachment_url, i.attachment_type, i.attachment_name,
               i.attachment_size, i.edited_at, i.deleted_at,
               i.created_at, i.updated_at
        FROM inserted i
        LEFT JOIN users u ON u.id = i.sender_id
        `,
        [
          conversationId,
          senderId,
          trimmed,
          attachment?.url ?? null,
          attachment?.type ?? null,
          attachment?.name ?? null,
          attachment?.size ?? null,
        ],
      );

      const row = inserted.rows[0];

      await client.query(
        `UPDATE conversations SET last_message_at = $2, updated_at = now() WHERE id = $1`,
        [conversationId, row.created_at],
      );

      // Mark sender as read up to this message
      await client.query(
        `UPDATE conversation_participants
         SET last_read_at = $3, updated_at = now()
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, senderId, row.created_at],
      );

      const participants = await client.query<{ user_id: string }>(
        `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
        [conversationId],
      );

      return {
        message: this.mapMessage(row),
        participantIds: participants.rows.map((p) => p.user_id),
      };
    });

    void this.notificationsService.notifyMessageCreated({
      conversationId,
      senderId,
      senderName: result.message.senderName ?? 'Someone',
      senderRole: result.message.senderRole,
      body: result.message.body,
      hasAttachment: !!result.message.attachment,
      recipientIds: result.participantIds,
    });

    return result;
  }

  // -----------------------------
  // List messages with pagination
  // -----------------------------
  async listMessages(
    conversationId: string,
    userId: string,
    before?: string,
    limit: number = 50,
  ): Promise<MessageResponse[]> {
    await this.ensureParticipant(conversationId, userId);

    const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100);

    const params: unknown[] = [conversationId];
    let beforeClause = '';
    if (before) {
      params.push(before);
      beforeClause = `AND m.created_at < $${params.length}::timestamptz`;
    }
    params.push(safeLimit);

    const result = await this.databaseService.query<MessageRow>(
      `
      SELECT m.id, m.conversation_id, m.sender_id, u.display_name AS sender_name,
             u.role AS sender_role, m.message_type::text AS message_type,
             m.body, m.attachment_url, m.attachment_type, m.attachment_name,
             m.attachment_size, m.edited_at, m.deleted_at,
             m.created_at, m.updated_at
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1
        ${beforeClause}
      ORDER BY m.created_at DESC
      LIMIT $${params.length}
      `,
      params,
    );

    // Return chronological order (oldest first)
    return result.rows.map((r) => this.mapMessage(r)).reverse();
  }

  // -----------------------------
  // Mark as read
  // -----------------------------
  async markAsRead(
    conversationId: string,
    userId: string,
  ): Promise<{ lastReadAt: string }> {
    await this.ensureParticipant(conversationId, userId);

    const now = new Date().toISOString();
    await this.databaseService.query(
      `UPDATE conversation_participants
       SET last_read_at = $3, updated_at = now()
       WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId, now],
    );

    return { lastReadAt: now };
  }

  // -----------------------------
  // Allowed users to start direct chat
  // -----------------------------
  async listAllowedDirectChatUsers(
    userId: string,
    role: AppRole,
    search?: string,
  ): Promise<AllowedUserRow[]> {
    // Leaders may DM anyone (other than themselves)
    // Members may DM only leaders
    const params: unknown[] = [userId];
    let roleFilter = '';
    if (!isLeader(role)) {
      params.push(LEADER_ROLES);
      roleFilter = `AND u.role = ANY($${params.length}::app_role[])`;
    }
    let searchFilter = '';
    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      searchFilter = `AND (LOWER(u.display_name) LIKE $${params.length} OR LOWER(u.email::text) LIKE $${params.length})`;
    }

    const result = await this.databaseService.query<AllowedUserRow>(
      `
      SELECT u.id, u.display_name, u.email::text AS email, u.role
      FROM users u
      WHERE u.id <> $1
        AND u.is_active = true
        ${roleFilter}
        ${searchFilter}
      ORDER BY u.display_name ASC
      LIMIT 100
      `,
      params,
    );
    return result.rows;
  }

  // -----------------------------
  // List participants of a conversation user belongs to
  // -----------------------------
  async listParticipants(
    conversationId: string,
    userId: string,
  ): Promise<AllowedUserRow[]> {
    await this.ensureParticipant(conversationId, userId);
    const result = await this.databaseService.query<AllowedUserRow>(
      `
      SELECT u.id, u.display_name, u.email::text AS email, u.role
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = $1
      ORDER BY u.display_name ASC
      `,
      [conversationId],
    );
    return result.rows;
  }

  // -----------------------------
  // Get a single conversation summary (after creation, etc.)
  // -----------------------------
  async getConversationForUser(
    conversationId: string,
    userId: string,
  ): Promise<ConversationSummary> {
    await this.ensureParticipant(conversationId, userId);
    const all = await this.listConversations(userId);
    const found = all.find((c) => c.id === conversationId);
    if (!found) throw new NotFoundException('Conversation not found');
    return found;
  }

  // -----------------------------
  // Total unread count
  // -----------------------------
  async getUnreadTotal(userId: string): Promise<number> {
    const result = await this.databaseService.query<{ total: string }>(
      `
      SELECT COALESCE(SUM(unread), 0)::text AS total FROM (
        SELECT (
          SELECT COUNT(*) FROM messages m
          WHERE m.conversation_id = cp.conversation_id
            AND m.deleted_at IS NULL
            AND m.sender_id IS DISTINCT FROM $1
            AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
        ) AS unread
        FROM conversation_participants cp
        WHERE cp.user_id = $1
      ) sub
      `,
      [userId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  // -----------------------------
  // Attachment storage (local filesystem)
  // -----------------------------
  async storeAttachment(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
    uploaderId: string;
  }): Promise<{ publicPath: string; filename: string }> {
    await fs.mkdir(MESSAGING_UPLOAD_DIR, { recursive: true });
    const ext = extname(input.originalName).toLowerCase() || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const fullPath = join(MESSAGING_UPLOAD_DIR, filename);
    await fs.writeFile(fullPath, input.buffer);

    this.activityLogService.logSystem({
      action: `MESSAGING_ATTACHMENT_UPLOADED: ${filename}`,
      metadata: {
        uploader_id: input.uploaderId,
        size: input.size,
        mime_type: input.mimeType,
        original_name: input.originalName,
      },
    });

    return { publicPath: `${MESSAGING_PUBLIC_PREFIX}/${filename}`, filename };
  }

  // -----------------------------
  // Mapping
  // -----------------------------
  private mapMessage(row: MessageRow): MessageResponse {
    const isDeleted = !!row.deleted_at;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderRole: row.sender_role,
      type: row.message_type,
      body: isDeleted ? '' : (row.body ?? ''),
      attachment:
        !isDeleted && row.attachment_url
          ? {
              url: row.attachment_url,
              type: row.attachment_type ?? '',
              name: row.attachment_name ?? '',
              size: row.attachment_size ?? 0,
            }
          : null,
      editedAt: row.edited_at,
      deletedAt: row.deleted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // -----------------------------
  // Edit message (sender only, text body)
  // -----------------------------
  async editMessage(
    messageId: string,
    senderId: string,
    body: string,
  ): Promise<{ message: MessageResponse; participantIds: string[] }> {
    const trimmed = (body ?? '').trim();
    if (!trimmed) throw new BadRequestException('Message body cannot be empty');

    const owner = await this.databaseService.query<{
      conversation_id: string;
      sender_id: string | null;
      deleted_at: string | null;
    }>(`SELECT conversation_id, sender_id, deleted_at FROM messages WHERE id = $1`, [messageId]);
    if (owner.rowCount === 0) throw new NotFoundException('Message not found');
    const { conversation_id, sender_id, deleted_at } = owner.rows[0];
    if (sender_id !== senderId) throw new ForbiddenException('You can only edit your own messages');
    if (deleted_at) throw new BadRequestException('Cannot edit a deleted message');

    const updated = await this.databaseService.query<MessageRow>(
      `
      WITH updated AS (
        UPDATE messages
        SET body = $2, edited_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING *
      )
      SELECT u2.id, u2.conversation_id, u2.sender_id, us.display_name AS sender_name,
             us.role AS sender_role, u2.message_type::text AS message_type,
             u2.body, u2.attachment_url, u2.attachment_type, u2.attachment_name,
             u2.attachment_size, u2.edited_at, u2.deleted_at,
             u2.created_at, u2.updated_at
      FROM updated u2
      LEFT JOIN users us ON us.id = u2.sender_id
      `,
      [messageId, trimmed],
    );

    const participants = await this.databaseService.query<{ user_id: string }>(
      `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
      [conversation_id],
    );

    return {
      message: this.mapMessage(updated.rows[0]),
      participantIds: participants.rows.map((p) => p.user_id),
    };
  }

  // -----------------------------
  // Soft delete message (sender only)
  // -----------------------------
  async softDeleteMessage(
    messageId: string,
    senderId: string,
  ): Promise<{ message: MessageResponse; participantIds: string[] }> {
    const owner = await this.databaseService.query<{
      conversation_id: string;
      sender_id: string | null;
      deleted_at: string | null;
    }>(`SELECT conversation_id, sender_id, deleted_at FROM messages WHERE id = $1`, [messageId]);
    if (owner.rowCount === 0) throw new NotFoundException('Message not found');
    const { conversation_id, sender_id, deleted_at } = owner.rows[0];
    if (sender_id !== senderId) throw new ForbiddenException('You can only delete your own messages');
    if (deleted_at) {
      // Already deleted; return current row
    }

    const updated = await this.databaseService.query<MessageRow>(
      `
      WITH updated AS (
        UPDATE messages
        SET deleted_at = COALESCE(deleted_at, now()),
            body = '',
            attachment_url = NULL,
            attachment_type = NULL,
            attachment_name = NULL,
            attachment_size = NULL,
            updated_at = now()
        WHERE id = $1
        RETURNING *
      )
      SELECT u2.id, u2.conversation_id, u2.sender_id, us.display_name AS sender_name,
             us.role AS sender_role, u2.message_type::text AS message_type,
             u2.body, u2.attachment_url, u2.attachment_type, u2.attachment_name,
             u2.attachment_size, u2.edited_at, u2.deleted_at,
             u2.created_at, u2.updated_at
      FROM updated u2
      LEFT JOIN users us ON us.id = u2.sender_id
      `,
      [messageId],
    );

    const participants = await this.databaseService.query<{ user_id: string }>(
      `SELECT user_id FROM conversation_participants WHERE conversation_id = $1`,
      [conversation_id],
    );

    return {
      message: this.mapMessage(updated.rows[0]),
      participantIds: participants.rows.map((p) => p.user_id),
    };
  }
}
