import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AppRole } from '../auth/auth-role.type';
import { toDateOnlyString } from '../common/date-utils';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDevotionDto } from './dto/create-devotion.dto';
import { UpdateDevotionDto } from './dto/update-devotion.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  DevotionStatus,
  REACTION_KINDS,
  ReactionKind,
} from './devotion.types';

const DEVOTION_MANAGER_ROLES: AppRole[] = [
  'president',
  'vp_prayers',
  'advisor_prayers',
];

type DevotionRow = {
  id: string;
  title: string;
  reference: string;
  verse: string;
  reflection: string;
  prayer_points: string[];
  scheduled_for: string;
  status: DevotionStatus;
  author_user_id: string | null;
  author: string;
  created_at: string;
  updated_at: string;
};

type CommentRow = {
  id: string;
  devotion_id: string;
  author_user_id: string | null;
  author: string;
  body: string;
  created_at: string;
};

type ReactionRow = {
  devotion_id: string;
  user_id: string;
  kind: ReactionKind;
  user_name: string;
};

export type DevotionResponse = {
  id: string;
  title: string;
  reference: string;
  verse: string;
  reflection: string;
  prayerPoints: string[];
  scheduledFor: string;
  status: DevotionStatus;
  author: string;
  authorUserId: string | null;
  reactions: Record<ReactionKind, string[]>;
  createdAt: string;
  updatedAt: string;
};

export type CommentResponse = {
  id: string;
  devotionId: string;
  author: string;
  authorUserId: string | null;
  body: string;
  createdAt: string;
};

@Injectable()
export class DevotionService implements OnModuleInit {
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

  private notifyDevotionPublishedSafely(devotion: DevotionResponse): void {
    this.dispatchNotificationSafely(
      this.notificationsService.notifyDevotionPublished({
        devotionId: devotion.id,
        title: devotion.title,
        summary: devotion.reflection?.slice(0, 240) ?? null,
        author: devotion.author,
        scriptureReference: devotion.reference,
      }),
      'DEVOTION_NOTIFY_FAILED',
      { devotion_id: devotion.id },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  async listDevotions(
    currentUser: { role: AppRole },
    options?: { includeUnpublished?: boolean },
  ): Promise<DevotionResponse[]> {
    await this.promoteScheduled();

    const canSeeAll = DEVOTION_MANAGER_ROLES.includes(currentUser.role);
    const includeUnpublished =
      options?.includeUnpublished === true && canSeeAll;

    const wheres: string[] = [];
    if (!includeUnpublished) {
      wheres.push(`d.status = 'published'`);
    }
    const whereSql = wheres.length ? `WHERE ${wheres.join(' AND ')}` : '';

    const result = await this.databaseService.query<DevotionRow>(
      `
      SELECT d.id, d.title, d.reference, d.verse, d.reflection, d.prayer_points,
             d.scheduled_for, d.status::text AS status, d.author_user_id,
             COALESCE(d.author_name, u.display_name, u.email, 'System') AS author,
             d.created_at, d.updated_at
      FROM devotions d
      LEFT JOIN users u ON u.id = d.author_user_id
      ${whereSql}
      ORDER BY d.scheduled_for DESC, d.created_at DESC
      `,
    );

    if (result.rows.length === 0) return [];

    const ids = result.rows.map((r) => r.id);
    const reactionsResult = await this.databaseService.query<ReactionRow>(
      `
      SELECT r.devotion_id, r.user_id, r.kind::text AS kind,
             COALESCE(u.display_name, u.email, 'User') AS user_name
      FROM devotion_reactions r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.devotion_id = ANY($1::uuid[])
      `,
      [ids],
    );

    const reactionsByDevotion = new Map<string, Record<ReactionKind, string[]>>();
    for (const row of reactionsResult.rows) {
      if (!reactionsByDevotion.has(row.devotion_id)) {
        reactionsByDevotion.set(row.devotion_id, this.emptyReactions());
      }
      reactionsByDevotion.get(row.devotion_id)![row.kind].push(row.user_name);
    }

    return result.rows.map((row) =>
      this.mapDevotion(row, reactionsByDevotion.get(row.id) ?? this.emptyReactions()),
    );
  }

  async getDevotion(
    devotionId: string,
    currentUser: { role: AppRole },
  ): Promise<DevotionResponse> {
    const result = await this.databaseService.query<DevotionRow>(
      `
      SELECT d.id, d.title, d.reference, d.verse, d.reflection, d.prayer_points,
             d.scheduled_for, d.status::text AS status, d.author_user_id,
             COALESCE(d.author_name, u.display_name, u.email, 'System') AS author,
             d.created_at, d.updated_at
      FROM devotions d
      LEFT JOIN users u ON u.id = d.author_user_id
      WHERE d.id = $1
      LIMIT 1
      `,
      [devotionId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Devotion not found');
    }

    const devotion = result.rows[0];
    const canSeeUnpublished = DEVOTION_MANAGER_ROLES.includes(currentUser.role);
    if (devotion.status !== 'published' && !canSeeUnpublished) {
      throw new ForbiddenException('Devotion is not yet published');
    }

    const reactionsResult = await this.databaseService.query<ReactionRow>(
      `
      SELECT r.devotion_id, r.user_id, r.kind::text AS kind,
             COALESCE(u.display_name, u.email, 'User') AS user_name
      FROM devotion_reactions r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.devotion_id = $1
      `,
      [devotionId],
    );
    const reactions = this.emptyReactions();
    for (const r of reactionsResult.rows) {
      reactions[r.kind].push(r.user_name);
    }

    return this.mapDevotion(devotion, reactions);
  }

  async createDevotion(
    dto: CreateDevotionDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<DevotionResponse> {
    if (!DEVOTION_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only prayers leadership can post devotions');
    }

    const status = dto.status ?? 'draft';
    const author = await this.resolveDisplayName(currentUser.sub, currentUser.email);

    const result = await this.databaseService.query<DevotionRow>(
      `
      INSERT INTO devotions (
        title, reference, verse, reflection, prayer_points,
        scheduled_for, status, author_user_id, author_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::devotion_status, $8, $9)
      RETURNING id, title, reference, verse, reflection, prayer_points,
                scheduled_for, status::text AS status, author_user_id,
                COALESCE(author_name, 'System') AS author, created_at, updated_at
      `,
      [
        dto.title.trim(),
        dto.reference.trim(),
        dto.verse.trim(),
        dto.reflection.trim(),
        dto.prayerPoints.filter(Boolean).map((p) => p.trim()),
        dto.scheduledFor,
        status,
        currentUser.sub,
        author,
      ],
    );

    this.activityLogService.logSystem({
      action: `DEVOTION_CREATE: ${result.rows[0].id}`,
      metadata: { devotion_id: result.rows[0].id, actor_id: currentUser.sub },
    });

    const created = this.mapDevotion(result.rows[0], this.emptyReactions());
    if (created.status === 'published') {
      this.notifyDevotionPublishedSafely(created);
    }
    return created;
  }

  async updateDevotion(
    devotionId: string,
    dto: UpdateDevotionDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<DevotionResponse> {
    if (!DEVOTION_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only prayers leadership can edit devotions');
    }

    const previous = await this.databaseService.query<{ status: DevotionStatus }>(
      `SELECT status::text AS status FROM devotions WHERE id = $1 LIMIT 1`,
      [devotionId],
    );
    const previousStatus = previous.rows[0]?.status;

    const result = await this.databaseService.query<DevotionRow>(
      `
      UPDATE devotions SET
        title = COALESCE($2, title),
        reference = COALESCE($3, reference),
        verse = COALESCE($4, verse),
        reflection = COALESCE($5, reflection),
        prayer_points = COALESCE($6, prayer_points),
        scheduled_for = COALESCE($7, scheduled_for),
        status = COALESCE($8::devotion_status, status),
        updated_at = now()
      WHERE id = $1
      RETURNING id, title, reference, verse, reflection, prayer_points,
                scheduled_for, status::text AS status, author_user_id,
                COALESCE(author_name, 'System') AS author, created_at, updated_at
      `,
      [
        devotionId,
        dto.title ?? null,
        dto.reference ?? null,
        dto.verse ?? null,
        dto.reflection ?? null,
        dto.prayerPoints ?? null,
        dto.scheduledFor ?? null,
        dto.status ?? null,
      ],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Devotion not found');
    }

    const updated = this.mapDevotion(result.rows[0], this.emptyReactions());
    if (updated.status === 'published' && previousStatus !== 'published') {
      this.notifyDevotionPublishedSafely(updated);
    }
    return updated;
  }

  async deleteDevotion(
    devotionId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ deletedDevotionId: string }> {
    if (!DEVOTION_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only prayers leadership can delete devotions');
    }

    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM devotions WHERE id = $1 RETURNING id`,
      [devotionId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Devotion not found');
    }
    return { deletedDevotionId: devotionId };
  }

  async publishDevotion(
    devotionId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<DevotionResponse> {
    if (!DEVOTION_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only prayers leadership can publish devotions');
    }
    const result = await this.databaseService.query<DevotionRow>(
      `
      UPDATE devotions SET status = 'published'::devotion_status, updated_at = now()
      WHERE id = $1
      RETURNING id, title, reference, verse, reflection, prayer_points,
                scheduled_for, status::text AS status, author_user_id,
                COALESCE(author_name, 'System') AS author, created_at, updated_at
      `,
      [devotionId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Devotion not found');
    }
    return this.mapDevotion(result.rows[0], this.emptyReactions());
  }

  async listComments(devotionId: string): Promise<CommentResponse[]> {
    const result = await this.databaseService.query<CommentRow>(
      `
      SELECT c.id, c.devotion_id, c.author_user_id,
             COALESCE(c.author_name, u.display_name, u.email, 'User') AS author,
             c.body, c.created_at
      FROM devotion_comments c
      LEFT JOIN users u ON u.id = c.author_user_id
      WHERE c.devotion_id = $1
      ORDER BY c.created_at ASC
      `,
      [devotionId],
    );
    return result.rows.map((r) => this.mapComment(r));
  }

  async addComment(
    devotionId: string,
    dto: CreateCommentDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<CommentResponse> {
    const author = await this.resolveDisplayName(currentUser.sub, currentUser.email);

    const devotionCheck = await this.databaseService.query<{ status: DevotionStatus }>(
      `SELECT status::text AS status FROM devotions WHERE id = $1 LIMIT 1`,
      [devotionId],
    );
    if (devotionCheck.rowCount === 0) {
      throw new NotFoundException('Devotion not found');
    }
    if (devotionCheck.rows[0].status !== 'published' && !DEVOTION_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Cannot comment on unpublished devotion');
    }

    const result = await this.databaseService.query<CommentRow>(
      `
      INSERT INTO devotion_comments (devotion_id, author_user_id, author_name, body)
      VALUES ($1, $2, $3, $4)
      RETURNING id, devotion_id, author_user_id,
                COALESCE(author_name, 'User') AS author, body, created_at
      `,
      [devotionId, currentUser.sub, author, dto.body.trim()],
    );

    return this.mapComment(result.rows[0]);
  }

  async deleteComment(
    devotionId: string,
    commentId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ ok: true }> {
    const isManager = DEVOTION_MANAGER_ROLES.includes(currentUser.role);
    const result = await this.databaseService.query<{ id: string }>(
      `
      DELETE FROM devotion_comments
      WHERE id = $1 AND devotion_id = $2
        AND ($3::boolean OR author_user_id = $4)
      RETURNING id
      `,
      [commentId, devotionId, isManager, currentUser.sub],
    );
    if (result.rowCount === 0) {
      throw new ForbiddenException('Cannot delete this comment');
    }
    return { ok: true };
  }

  async toggleReaction(
    devotionId: string,
    kind: ReactionKind,
    currentUser: { sub: string },
  ): Promise<{ added: boolean; reactions: Record<ReactionKind, string[]> }> {
    if (!REACTION_KINDS.includes(kind)) {
      throw new BadRequestException('Invalid reaction kind');
    }

    const devotionCheck = await this.databaseService.query<{ id: string }>(
      `SELECT id FROM devotions WHERE id = $1 LIMIT 1`,
      [devotionId],
    );
    if (devotionCheck.rowCount === 0) {
      throw new NotFoundException('Devotion not found');
    }

    const existing = await this.databaseService.query<{ user_id: string }>(
      `SELECT user_id FROM devotion_reactions
       WHERE devotion_id = $1 AND user_id = $2 AND kind = $3::reaction_kind LIMIT 1`,
      [devotionId, currentUser.sub, kind],
    );

    let added = false;
    if (existing.rowCount && existing.rowCount > 0) {
      await this.databaseService.query(
        `DELETE FROM devotion_reactions
         WHERE devotion_id = $1 AND user_id = $2 AND kind = $3::reaction_kind`,
        [devotionId, currentUser.sub, kind],
      );
    } else {
      await this.databaseService.query(
        `INSERT INTO devotion_reactions (devotion_id, user_id, kind)
         VALUES ($1, $2, $3::reaction_kind)`,
        [devotionId, currentUser.sub, kind],
      );
      added = true;
    }

    const reactionsResult = await this.databaseService.query<ReactionRow>(
      `
      SELECT r.devotion_id, r.user_id, r.kind::text AS kind,
             COALESCE(u.display_name, u.email, 'User') AS user_name
      FROM devotion_reactions r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.devotion_id = $1
      `,
      [devotionId],
    );
    const reactions = this.emptyReactions();
    for (const r of reactionsResult.rows) reactions[r.kind].push(r.user_name);

    return { added, reactions };
  }

  /**
   * Returns the most recent published devotion whose scheduled date is on or
   * before today. Used by the Sidebar / Dashboard "Verse of the day" widget.
   * Returns null when no devotion has been published yet.
   */
  async getVerseOfTheDay(): Promise<DevotionResponse | null> {
    await this.promoteScheduled();

    const result = await this.databaseService.query<DevotionRow>(
      `
      SELECT d.id, d.title, d.reference, d.verse, d.reflection, d.prayer_points,
             d.scheduled_for, d.status::text AS status, d.author_user_id,
             COALESCE(d.author_name, u.display_name, u.email, 'System') AS author,
             d.created_at, d.updated_at
      FROM devotions d
      LEFT JOIN users u ON u.id = d.author_user_id
      WHERE d.status = 'published'
        AND d.scheduled_for <= CURRENT_DATE
      ORDER BY d.scheduled_for DESC, d.created_at DESC
      LIMIT 1
      `,
    );

    if (result.rows.length === 0) return null;
    return this.mapDevotion(result.rows[0], this.emptyReactions());
  }

  private async promoteScheduled(): Promise<void> {
    await this.databaseService.query(`
      UPDATE devotions
      SET status = 'published', updated_at = now()
      WHERE status = 'scheduled' AND scheduled_for <= CURRENT_DATE
    `);
  }

  private async resolveDisplayName(
    userId: string,
    fallbackEmail: string,
  ): Promise<string> {
    const result = await this.databaseService.query<{
      display_name: string | null;
      email: string | null;
    }>(`SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (row?.display_name?.trim()) return row.display_name.trim();
    if (row?.email?.trim()) return row.email.trim();
    return fallbackEmail || 'System';
  }

  private emptyReactions(): Record<ReactionKind, string[]> {
    return { amen: [], pray: [], love: [], fire: [] };
  }

  private mapDevotion(
    row: DevotionRow,
    reactions: Record<ReactionKind, string[]>,
  ): DevotionResponse {
    return {
      id: row.id,
      title: row.title,
      reference: row.reference,
      verse: row.verse,
      reflection: row.reflection,
      prayerPoints: row.prayer_points ?? [],
      scheduledFor: toDateOnlyString(row.scheduled_for) as string,
      status: row.status,
      author: row.author,
      authorUserId: row.author_user_id,
      reactions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapComment(row: CommentRow): CommentResponse {
    return {
      id: row.id,
      devotionId: row.devotion_id,
      author: row.author,
      authorUserId: row.author_user_id,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'devotion_status') THEN
          CREATE TYPE devotion_status AS ENUM ('draft','scheduled','published');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reaction_kind') THEN
          CREATE TYPE reaction_kind AS ENUM ('amen','pray','love','fire');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS devotions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        reference text NOT NULL,
        verse text NOT NULL,
        reflection text NOT NULL,
        prayer_points text[] NOT NULL DEFAULT ARRAY[]::text[],
        scheduled_for date NOT NULL,
        status devotion_status NOT NULL DEFAULT 'draft',
        author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        author_name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE devotions ADD COLUMN IF NOT EXISTS prayer_points text[] NOT NULL DEFAULT ARRAY[]::text[]
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS devotion_comments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        devotion_id uuid NOT NULL REFERENCES devotions(id) ON DELETE CASCADE,
        author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        author_name text,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS devotion_reactions (
        devotion_id uuid NOT NULL REFERENCES devotions(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind reaction_kind NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (devotion_id, user_id, kind)
      )
    `);

    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS devotions_scheduled_for_idx ON devotions (scheduled_for DESC)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS devotion_comments_devotion_idx ON devotion_comments (devotion_id)`,
    );
  }
}
