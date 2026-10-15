import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { APP_ROLES, AppRole } from '../auth/auth-role.type';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAnnouncementsDto } from './dto/list-announcements.dto';
import { AnnouncementCategory } from './announcement-category';
import { AnnouncementStatus } from './announcement-status';
import { UpdateAnnouncementStatusDto } from './dto/update-announcement-status.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

type AnnouncementListRow = {
  id: string;
  author_user_id: string | null;
  title: string;
  body: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  scheduled_for: string | null;
  expires_at: string | null;
  audience_type: string;
  audience_roles: string[] | null;
  author: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type AnnouncementCreateRow = {
  id: string;
  author_user_id: string | null;
  title: string;
  body: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  scheduled_for: string | null;
  expires_at: string | null;
  audience_type: string;
  audience_roles: string[] | null;
  author: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

type CountRow = {
  total: number;
};

type AuthorRow = {
  display_name: string | null;
  email: string;
};

type AnnouncementOwnerRow = {
  id: string;
  author_user_id: string | null;
};

type PublishedAnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience_type: string;
  audience_roles: string[] | null;
  author: string;
};

export type AnnouncementResponse = {
  id: string;
  authorUserId: string | null;
  title: string;
  body: string;
  category: AnnouncementCategory;
  status: AnnouncementStatus;
  scheduledFor: string | null;
  expiresAt: string | null;
  author: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AnnouncementListResponse = {
  items: AnnouncementResponse[];
  total: number;
};

const ANNOUNCEMENT_PUBLISHER_ROLES: AppRole[] = [
  'president',
];

const ANNOUNCEMENT_LEADER_ROLES: AppRole[] = [
  'president',
  'vp_prayers',
  'vp_social',
  'advisor_prayers',
  'advisor_social',
  'accountant',
  'secretary',
];

const ANNOUNCEMENT_PIN_MANAGER_ROLES: AppRole[] = ['president', 'secretary'];
const ANNOUNCEMENT_AUDIENCE_TYPES = ['all', 'leaders_only', 'role_based'] as const;
type AnnouncementAudienceType = (typeof ANNOUNCEMENT_AUDIENCE_TYPES)[number];

@Injectable()
export class AnnouncementsService implements OnModuleInit {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly activityLogService: ActivityLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAnnouncementsSchema();
  }

  async listPublicAnnouncements(limit: number = 10): Promise<{ items: AnnouncementResponse[] }> {
    await this.promoteDueScheduledAnnouncements();

    const result = await this.databaseService.query<AnnouncementListRow>(
      `
      SELECT
        a.id,
        a.author_user_id,
        a.title,
        a.body,
        a.category::text AS category,
        a.status::text AS status,
        a.scheduled_for,
        a.expires_at,
        a.audience_type::text AS audience_type,
        a.audience_roles,
        COALESCE(a.author_name, u.display_name, u.email, 'System') AS author,
        a.pinned,
        a.created_at,
        a.updated_at
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_user_id
      WHERE a.status = 'published'
        AND a.audience_type = 'all'
        AND (a.expires_at IS NULL OR a.expires_at > now())
      ORDER BY a.pinned DESC, a.created_at DESC
      LIMIT $1
      `,
      [limit],
    );

    return {
      items: result.rows.map((row) => this.mapListRow(row)),
    };
  }

  async listAnnouncements(
    requester: { role: AppRole; sub: string },
    query: ListAnnouncementsDto,
  ): Promise<AnnouncementListResponse> {
    const requesterRole = requester.role;
    const requesterUserId = requester.sub;

    if (!APP_ROLES.includes(requesterRole)) {
      throw new ForbiddenException('Only authenticated users can view announcements');
    }

    await this.promoteDueScheduledAnnouncements();

    const includeUnpublishedRequested = query.includeUnpublished === true;
    const canSeeAnyUnpublished = requesterRole === 'president';
    const canIncludeUnpublished =
      canSeeAnyUnpublished || ANNOUNCEMENT_LEADER_ROLES.includes(requesterRole);

    if (includeUnpublishedRequested && !canIncludeUnpublished) {
      throw new ForbiddenException(
        'Only leaders can view unpublished announcements',
      );
    }

    const includeUnpublished =
      includeUnpublishedRequested && canIncludeUnpublished;

    const filterParams: unknown[] = [];
    const whereClauses: string[] = [];

    if (query.category) {
      filterParams.push(query.category);
      whereClauses.push(`a.category = $${filterParams.length}`);
    }

    if (query.status) {
      if (!includeUnpublished && query.status !== 'published') {
        throw new ForbiddenException(
          'Only published announcements are visible for your current query settings',
        );
      }
      filterParams.push(query.status);
      whereClauses.push(`a.status = $${filterParams.length}::announcement_status`);
    } else if (!includeUnpublished) {
      whereClauses.push(`a.status = 'published'`);
    }

    if (includeUnpublished && !canSeeAnyUnpublished) {
      filterParams.push(requesterUserId);
      whereClauses.push(
        `(a.status = 'published' OR a.author_user_id = $${filterParams.length})`,
      );
    }

    // Filter by expiry: exclude announcements where expires_at is in the past
    whereClauses.push(`(a.expires_at IS NULL OR a.expires_at > now())`);

    // Filter by audience targeting
    const isLeader = ['president', 'vp_prayers', 'vp_social', 'advisor_prayers', 'advisor_social', 'secretary', 'accountant'].includes(requesterRole);
    const audienceFilter =
      `(a.status <> 'published' OR ` +
      `a.audience_type = 'all' OR ` +
      `(a.audience_type = 'leaders_only' AND $${filterParams.length + 1}::boolean = true) OR ` +
      `(a.audience_type = 'role_based' AND $${filterParams.length + 2}::app_role = ANY(COALESCE(a.audience_roles, ARRAY[]::app_role[]))))`;
    whereClauses.push(audienceFilter);
    filterParams.push(isLeader);
    filterParams.push(requesterRole);

    const whereSql =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const listParams = [...filterParams];
    
    // Build pagination SQL
    let paginationSql = '';
    if (typeof query.offset === 'number' && query.offset > 0) {
      paginationSql += `OFFSET $${listParams.push(query.offset)}`;
    }
    
    if (typeof query.limit === 'number') {
      paginationSql += `${paginationSql ? ' ' : ''}LIMIT $${listParams.push(query.limit)}`;
    }

    const listResult = await this.databaseService.query<AnnouncementListRow>(
      `
      SELECT
        a.id,
        a.author_user_id,
        a.title,
        a.body,
        a.category::text AS category,
        a.status::text AS status,
        a.scheduled_for,
        a.expires_at,
        a.audience_type::text AS audience_type,
        a.audience_roles,
        COALESCE(a.author_name, u.display_name, u.email, 'System') AS author,
        a.pinned,
        a.created_at,
        a.updated_at
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_user_id
      ${whereSql}
      ORDER BY a.pinned DESC, a.created_at DESC
      ${paginationSql}
      `,
      listParams,
    );

    const countResult = await this.databaseService.query<CountRow>(
      `
      SELECT COUNT(*)::int AS total
      FROM announcements a
      ${whereSql}
      `,
      filterParams,
    );

    return {
      items: listResult.rows.map((row) => this.mapListRow(row)),
      total: countResult.rows[0]?.total ?? 0,
    };
  }

  async createAnnouncement(
    dto: CreateAnnouncementDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<{ announcement: AnnouncementResponse }> {
    const isPresident = currentUser.role === 'president';
    if (!ANNOUNCEMENT_LEADER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException(
        'Only leaders can create announcements',
      );
    }

    const title = dto.title.trim();
    const body = dto.body.trim();

    if (!title || !body) {
      throw new BadRequestException('title and body are required');
    }

    const category = dto.category ?? 'general';
    const pinned = dto.pinned ?? false;
    const status = dto.status ?? (isPresident ? 'published' : 'draft');
    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const audience = this.resolveAudienceTargeting(
      dto.audienceType,
      dto.audienceRoles,
    );

    if (!isPresident && status !== 'draft') {
      throw new ForbiddenException(
        'Only president can create published or scheduled announcements. Submit as draft for approval.',
      );
    }

    if (pinned && !ANNOUNCEMENT_PIN_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException(
        'Only president and secretary can publish a pinned announcement',
      );
    }

    this.validateLifecycleInput(status, scheduledFor, expiresAt, true);

    const authorName = await this.resolveAuthorName(
      currentUser.sub,
      currentUser.email,
    );

    const result = await this.databaseService.query<AnnouncementCreateRow>(
      `
      WITH inserted AS (
        INSERT INTO announcements (
          title,
          body,
          category,
          status,
          scheduled_for,
          expires_at,
          audience_type,
          audience_roles,
          author_user_id,
          author_name,
          pinned
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
          id,
          title,
          body,
          category,
          status,
          scheduled_for,
          expires_at,
          audience_type,
          audience_roles,
          author_user_id,
          author_name,
          pinned,
          created_at,
          updated_at
      )
      SELECT
        i.id,
        i.author_user_id,
        i.title,
        i.body,
        i.category::text AS category,
        i.status::text AS status,
        i.scheduled_for,
        i.expires_at,
        i.audience_type::text AS audience_type,
        i.audience_roles,
        COALESCE(i.author_name, u.display_name, u.email, 'System') AS author,
        i.pinned,
        i.created_at,
        i.updated_at
      FROM inserted i
      LEFT JOIN users u ON u.id = i.author_user_id
      `,
      [
        title,
        body,
        category,
        status,
        status === 'scheduled' ? scheduledFor?.toISOString() : null,
        status === 'scheduled' ? expiresAt?.toISOString() : null,
        audience.audienceType,
        audience.audienceRoles,
        currentUser.sub,
        authorName,
        pinned,
      ],
    );

    const announcement = this.mapCreateRow(result.rows[0]);

    if (status === 'published') {
      this.queueAudiencePublishedNotification({
        announcementId: announcement.id,
        title: announcement.title,
        body: announcement.body,
        author: announcement.author,
        audienceType: audience.audienceType,
        audienceRoles: audience.audienceRoles,
        source: 'create',
      });
    }

    if (!isPresident && status === 'draft') {
      this.queuePresidentApprovalNotification({
        announcementId: announcement.id,
        title: announcement.title,
        author: announcement.author,
        authorRole: currentUser.role,
      });
    }

    // Audit log
    this.activityLogService.logSystem({
      action: `ANNOUNCEMENT_CREATE: ${announcement.id}`,
      metadata: {
        announcement_id: announcement.id,
        title: announcement.title,
        author_id: currentUser.sub,
        author_email: currentUser.email,
        category: announcement.category,
        status: announcement.status,
        audience_type: audience.audienceType,
        audience_roles: audience.audienceRoles,
      },
    });

    return {
      announcement,
    };
  }

  async updateAnnouncement(
    announcementId: string,
    dto: UpdateAnnouncementDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ announcement: AnnouncementResponse }> {
    const hasUpdateInput =
      dto.title !== undefined ||
      dto.body !== undefined ||
      dto.category !== undefined;

    if (!hasUpdateInput) {
      throw new BadRequestException('At least one field is required for update');
    }

    await this.assertOwnerOrPresident(announcementId, currentUser);

    const nextTitle = dto.title?.trim();
    const nextBody = dto.body?.trim();

    if (dto.title !== undefined && !nextTitle) {
      throw new BadRequestException('title cannot be empty');
    }

    if (dto.body !== undefined && !nextBody) {
      throw new BadRequestException('body cannot be empty');
    }

    const result = await this.databaseService.query<AnnouncementCreateRow>(
      `
      WITH updated AS (
        UPDATE announcements
        SET
          title = COALESCE($2, title),
          body = COALESCE($3, body),
          category = COALESCE($4::announcement_category, category),
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          author_user_id,
          title,
          body,
          category,
          status,
          scheduled_for,
          expires_at,
          audience_type,
          audience_roles,
          author_name,
          pinned,
          created_at,
          updated_at
      )
      SELECT
        u.id,
        u.author_user_id,
        u.title,
        u.body,
        u.category::text AS category,
        u.status::text AS status,
        u.scheduled_for,
        u.expires_at,
        u.audience_type::text AS audience_type,
        u.audience_roles,
        COALESCE(u.author_name, author.display_name, author.email, 'System') AS author,
        u.pinned,
        u.created_at,
        u.updated_at
      FROM updated u
      LEFT JOIN users author ON author.id = u.author_user_id
      `,
      [announcementId, nextTitle ?? null, nextBody ?? null, dto.category ?? null],
    );

    const updated = result.rows[0];
    if (!updated) {
      throw new NotFoundException('Announcement not found');
    }

    const mapped = this.mapCreateRow(updated);

    this.activityLogService.logSystem({
      action: `ANNOUNCEMENT_UPDATE: ${announcementId}`,
      metadata: {
        announcement_id: announcementId,
        actor_id: currentUser.sub,
        actor_role: currentUser.role,
      },
    });

    return {
      announcement: mapped,
    };
  }

  async deleteAnnouncement(
    announcementId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ deletedAnnouncementId: string }> {
    await this.assertOwnerOrPresident(announcementId, currentUser);

    const result = await this.databaseService.query<{ id: string }>(
      `
      DELETE FROM announcements
      WHERE id = $1
      RETURNING id
      `,
      [announcementId],
    );

    const deleted = result.rows[0];
    if (!deleted) {
      throw new NotFoundException('Announcement not found');
    }

    this.activityLogService.logSystem({
      action: `ANNOUNCEMENT_DELETE: ${announcementId}`,
      metadata: {
        announcement_id: announcementId,
        actor_id: currentUser.sub,
        actor_role: currentUser.role,
      },
    });

    return {
      deletedAnnouncementId: deleted.id,
    };
  }

  async updateAnnouncementStatus(
    announcementId: string,
    dto: UpdateAnnouncementStatusDto,
    requesterRole: AppRole,
  ): Promise<{ announcement: AnnouncementResponse }> {
    if (!ANNOUNCEMENT_LEADER_ROLES.includes(requesterRole)) {
      throw new ForbiddenException(
        'Only leaders can update announcement status',
      );
    }

    if (
      (dto.status === 'published' || dto.status === 'scheduled') &&
      !ANNOUNCEMENT_PUBLISHER_ROLES.includes(requesterRole)
    ) {
      throw new ForbiddenException(
        'Only president can approve and publish announcements',
      );
    }

    const scheduledFor = dto.scheduledFor ? new Date(dto.scheduledFor) : null;
    this.validateLifecycleInput(dto.status, scheduledFor, null);

    const existingResult = await this.databaseService.query<{
      status: AnnouncementStatus;
    }>(
      `
      SELECT status::text AS status
      FROM announcements
      WHERE id = $1
      LIMIT 1
      `,
      [announcementId],
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    const result = await this.databaseService.query<AnnouncementCreateRow>(
      `
      WITH updated AS (
        UPDATE announcements
        SET
          status = $2::announcement_status,
          scheduled_for = $3,
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          title,
          body,
          category,
          status,
          scheduled_for,
          expires_at,
          audience_type,
          audience_roles,
          author_user_id,
          author_name,
          pinned,
          created_at,
          updated_at
      )
      SELECT
        u.id,
        u.author_user_id,
        u.title,
        u.body,
        u.category::text AS category,
        u.status::text AS status,
        u.scheduled_for,
        u.expires_at,
        u.audience_type::text AS audience_type,
        u.audience_roles,
        COALESCE(u.author_name, author.display_name, author.email, 'System') AS author,
        u.pinned,
        u.created_at,
        u.updated_at
      FROM updated u
      LEFT JOIN users author ON author.id = u.author_user_id
      `,
      [
        announcementId,
        dto.status,
        dto.status === 'scheduled' ? scheduledFor?.toISOString() : null,
      ],
    );

    const announcement = result.rows[0];
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const mapped = this.mapCreateRow(announcement);

    const isPublishTransition =
      dto.status === 'published' && existing.status !== 'published';

    if (isPublishTransition) {
      this.queueAudiencePublishedNotification({
        announcementId: mapped.id,
        title: mapped.title,
        body: mapped.body,
        author: mapped.author,
        audienceType: announcement.audience_type,
        audienceRoles: announcement.audience_roles,
        source: 'status-update',
      });
    }

    // Audit log
    this.activityLogService.logSystem({
      action: `ANNOUNCEMENT_STATUS_UPDATE: ${announcementId}`,
      metadata: {
        announcement_id: announcementId,
        new_status: dto.status,
        actor_role: requesterRole,
      },
    });

    return {
      announcement: mapped,
    };
  }

  async setAnnouncementPinned(
    announcementId: string,
    pinned: boolean,
    requesterRole: AppRole,
  ): Promise<{ announcement: AnnouncementResponse }> {
    if (!ANNOUNCEMENT_PIN_MANAGER_ROLES.includes(requesterRole)) {
      throw new ForbiddenException(
        'Only president and secretary can pin or unpin announcements',
      );
    }

    const result = await this.databaseService.query<AnnouncementCreateRow>(
      `
      WITH updated AS (
        UPDATE announcements
        SET
          pinned = $2,
          updated_at = now()
        WHERE id = $1
        RETURNING
          id,
          title,
          body,
          category,
          status,
          scheduled_for,
          expires_at,
          audience_type,
          audience_roles,
          author_user_id,
          author_name,
          pinned,
          created_at,
          updated_at
      )
      SELECT
        u.id,
        u.author_user_id,
        u.title,
        u.body,
        u.category::text AS category,
        u.status::text AS status,
        u.scheduled_for,
        u.expires_at,
        u.audience_type::text AS audience_type,
        u.audience_roles,
        COALESCE(u.author_name, author.display_name, author.email, 'System') AS author,
        u.pinned,
        u.created_at,
        u.updated_at
      FROM updated u
      LEFT JOIN users author ON author.id = u.author_user_id
      `,
      [announcementId, pinned],
    );

    const announcement = result.rows[0];
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const mapped = this.mapCreateRow(announcement);

    // Audit log
    this.activityLogService.logSystem({
      action: `ANNOUNCEMENT_${pinned ? 'PIN' : 'UNPIN'}: ${announcementId}`,
      metadata: {
        announcement_id: announcementId,
        pinned,
        actor_role: requesterRole,
      },
    });

    return {
      announcement: mapped,
    };
  }

  private mapListRow(row: AnnouncementListRow): AnnouncementResponse {
    return {
      id: row.id,
      authorUserId: row.author_user_id,
      title: row.title,
      body: row.body,
      category: row.category,
      status: row.status,
      scheduledFor: row.scheduled_for,
      expiresAt: row.expires_at,
      author: row.author,
      pinned: row.pinned,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapCreateRow(row: AnnouncementCreateRow): AnnouncementResponse {
    return {
      id: row.id,
      authorUserId: row.author_user_id,
      title: row.title,
      body: row.body,
      category: row.category,
      status: row.status,
      scheduledFor: row.scheduled_for,
      expiresAt: row.expires_at,
      author: row.author,
      pinned: row.pinned,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private validateLifecycleInput(
    status: AnnouncementStatus,
    scheduledFor: Date | null,
    expiresAt: Date | null,
    requireExpiresAtOnScheduled = false,
  ): void {
    if (status === 'scheduled') {
      if (!scheduledFor) {
        throw new BadRequestException(
          'scheduledFor is required when status is scheduled',
        );
      }

      if (scheduledFor.getTime() <= Date.now()) {
        throw new BadRequestException(
          'scheduledFor must be in the future for scheduled announcements',
        );
      }

      if (requireExpiresAtOnScheduled && !expiresAt) {
        throw new BadRequestException(
          'expiresAt is required when status is scheduled',
        );
      }

      if (expiresAt && expiresAt.getTime() <= scheduledFor.getTime()) {
        throw new BadRequestException(
          'expiresAt must be after scheduledFor',
        );
      }

      return;
    }

    if (scheduledFor) {
      throw new BadRequestException(
        'scheduledFor can only be provided when status is scheduled',
      );
    }

    if (expiresAt) {
      throw new BadRequestException(
        'expiresAt can only be provided when status is scheduled',
      );
    }
  }

  private async promoteDueScheduledAnnouncements(): Promise<void> {
    const promotedResult = await this.databaseService.query<PublishedAnnouncementRow>(
      `
      WITH promoted AS (
        UPDATE announcements
        SET
          status = 'published',
          scheduled_for = NULL,
          updated_at = now()
        WHERE
          status = 'scheduled'
          AND scheduled_for IS NOT NULL
          AND scheduled_for <= now()
        RETURNING
          id,
          title,
          body,
          audience_type,
          audience_roles,
          author_name,
          author_user_id
      )
      SELECT
        p.id,
        p.title,
        p.body,
        p.audience_type::text AS audience_type,
        p.audience_roles,
        COALESCE(p.author_name, u.display_name, u.email, 'System') AS author
      FROM promoted p
      LEFT JOIN users u ON u.id = p.author_user_id
      `,
    );

    for (const announcement of promotedResult.rows) {
      this.queueAudiencePublishedNotification({
        announcementId: announcement.id,
        title: announcement.title,
        body: announcement.body,
        author: announcement.author,
        audienceType: announcement.audience_type,
        audienceRoles: announcement.audience_roles,
        source: 'scheduled-auto-publish',
      });
    }
  }

  private async resolveAuthorName(
    userId: string,
    fallbackEmail: string,
  ): Promise<string> {
    const result = await this.databaseService.query<AuthorRow>(
      `
      SELECT display_name, email
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId],
    );

    const row = result.rows[0];

    if (row?.display_name?.trim()) {
      return row.display_name.trim();
    }

    if (row?.email?.trim()) {
      return row.email.trim();
    }

    if (fallbackEmail.trim()) {
      return fallbackEmail.trim();
    }

    return 'System';
  }

  private resolveAudienceTargeting(
    audienceTypeInput: CreateAnnouncementDto['audienceType'],
    audienceRolesInput: CreateAnnouncementDto['audienceRoles'],
  ): { audienceType: AnnouncementAudienceType; audienceRoles: AppRole[] | null } {
    const audienceType = audienceTypeInput ?? 'all';
    if (!ANNOUNCEMENT_AUDIENCE_TYPES.includes(audienceType)) {
      throw new BadRequestException('Invalid audienceType provided');
    }

    const rawRoles = Array.isArray(audienceRolesInput) ? audienceRolesInput : [];
    const audienceRoles = Array.from(
      new Set(
        rawRoles.filter((role): role is AppRole =>
          APP_ROLES.includes(role as AppRole),
        ),
      ),
    );

    if (audienceType === 'role_based') {
      if (audienceRoles.length === 0) {
        throw new BadRequestException(
          'Select at least one audience role when audienceType is role_based',
        );
      }

      return {
        audienceType,
        audienceRoles,
      };
    }

    if (rawRoles.length > 0) {
      throw new BadRequestException(
        'audienceRoles can only be provided when audienceType is role_based',
      );
    }

    return {
      audienceType,
      audienceRoles: null,
    };
  }

  private async assertOwnerOrPresident(
    announcementId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<void> {
    const result = await this.databaseService.query<AnnouncementOwnerRow>(
      `
      SELECT id, author_user_id
      FROM announcements
      WHERE id = $1
      LIMIT 1
      `,
      [announcementId],
    );

    const announcement = result.rows[0];
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const isOwner = announcement.author_user_id === currentUser.sub;
    const isPresident = currentUser.role === 'president';

    if (!isOwner && !isPresident) {
      throw new ForbiddenException(
        'Only the announcement owner or president can perform this action',
      );
    }
  }

  private queueAudiencePublishedNotification(input: {
    announcementId: string;
    title: string;
    body: string;
    author: string;
    audienceType: string;
    audienceRoles: string[] | null;
    source: 'create' | 'status-update' | 'scheduled-auto-publish';
  }): void {
    const audienceType = this.normalizeAudienceType(input.audienceType);
    if (!audienceType) {
      this.activityLogService.logSystem({
        action: 'ANNOUNCEMENT_AUDIENCE_NOTIFY_SKIPPED',
        success: false,
        metadata: {
          announcement_id: input.announcementId,
          reason: 'invalid_audience_type',
          audience_type: input.audienceType,
        },
      });
      return;
    }

    const audienceRoles = (input.audienceRoles ?? []).filter(
      (role): role is AppRole => APP_ROLES.includes(role as AppRole),
    );

    this.dispatchNotificationSafely(
      this.notificationsService.notifyAudienceAnnouncementPublished({
        announcementId: input.announcementId,
        title: input.title,
        body: input.body,
        author: input.author,
        audienceType,
        audienceRoles,
      }),
      'ANNOUNCEMENT_AUDIENCE_NOTIFY_FAILED',
      {
        announcement_id: input.announcementId,
        source: input.source,
      },
    );
  }

  private queuePresidentApprovalNotification(input: {
    announcementId: string;
    title: string;
    author: string;
    authorRole: AppRole;
  }): void {
    this.dispatchNotificationSafely(
      this.notificationsService.notifyPresidentsApprovalNeeded({
        announcementId: input.announcementId,
        title: input.title,
        author: input.author,
        authorRole: input.authorRole,
      }),
      'ANNOUNCEMENT_APPROVAL_NOTIFY_FAILED',
      {
        announcement_id: input.announcementId,
        author_role: input.authorRole,
      },
    );
  }

  private dispatchNotificationSafely(
    promise: Promise<void>,
    failureAction: string,
    metadata: Record<string, unknown>,
  ): void {
    void promise.catch((error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Unknown notification error';
      this.activityLogService.logSystem({
        action: failureAction,
        success: false,
        metadata: {
          ...metadata,
          error: message,
        },
      });
    });
  }

  private normalizeAudienceType(
    audienceType: string,
  ): 'all' | 'leaders_only' | 'role_based' | null {
    if (audienceType === 'all') {
      return 'all';
    }

    if (audienceType === 'leaders_only') {
      return 'leaders_only';
    }

    if (audienceType === 'role_based') {
      return 'role_based';
    }

    return null;
  }

  private async ensureAnnouncementsSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'announcement_audience_type'
        ) THEN
          CREATE TYPE announcement_audience_type AS ENUM (
            'all',
            'leaders_only',
            'role_based'
          );
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'announcement_category'
        ) THEN
          CREATE TYPE announcement_category AS ENUM (
            'urgent',
            'spiritual',
            'finance',
            'social',
            'academic',
            'general'
          );
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'announcement_status'
        ) THEN
          CREATE TYPE announcement_status AS ENUM (
            'draft',
            'scheduled',
            'published',
            'archived'
          );
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        body text NOT NULL,
        category announcement_category NOT NULL DEFAULT 'general',
        status announcement_status NOT NULL DEFAULT 'published',
        scheduled_for timestamptz,
        expires_at timestamptz,
        audience_type announcement_audience_type NOT NULL DEFAULT 'all',
        audience_roles app_role[] DEFAULT ARRAY[]::app_role[],
        author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        author_name text,
        pinned boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS status announcement_status
    `);

    await this.databaseService.query(`
      ALTER TABLE announcements
      ALTER COLUMN status SET DEFAULT 'published'
    `);

    await this.databaseService.query(`
      UPDATE announcements
      SET status = 'published'
      WHERE status IS NULL
    `);

    await this.databaseService.query(`
      ALTER TABLE announcements
      ALTER COLUMN status SET NOT NULL
    `);

    await this.databaseService.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS scheduled_for timestamptz
    `);

    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS announcements_created_at_idx
      ON announcements (created_at DESC)
    `);

    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS announcements_category_idx
      ON announcements (category)
    `);

    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS announcements_status_idx
      ON announcements (status)
    `);

    // Add new columns for expiry and audience targeting
    await this.databaseService.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS expires_at timestamptz
    `);

    await this.databaseService.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS audience_type announcement_audience_type DEFAULT 'all'
    `);

    await this.databaseService.query(`
      ALTER TABLE announcements
      ADD COLUMN IF NOT EXISTS audience_roles app_role[] DEFAULT ARRAY[]::app_role[]
    `);

    // Create index for audience_type filtering
    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS announcements_audience_type_idx
      ON announcements (audience_type)
    `);

    // Create index for expires_at filtering
    await this.databaseService.query(`
      CREATE INDEX IF NOT EXISTS announcements_expires_at_idx
      ON announcements (expires_at)
    `);
  }
}
