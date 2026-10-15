import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { AppRole } from '../auth/auth-role.type';
import { toDateOnlyString } from '../common/date-utils';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMinuteDto } from './dto/create-minute.dto';
import { UpdateMinuteDto } from './dto/update-minute.dto';
import { AgendaItemDto } from './dto/agenda-item.dto';
import { CreateResolutionDto, UpdateResolutionDto } from './dto/resolution.dto';
import { CreateActionItemDto } from './dto/action-item.dto';
import { AddDocumentVersionDto, CreateDocumentDto } from './dto/document.dto';
import {
  DocCategory,
  MeetingType,
  MinuteStatus,
  ResolutionStatus,
} from './minutes.types';

const MINUTES_MANAGER_ROLES: AppRole[] = ['president', 'secretary'];
const MINUTES_VIEWER_ROLES: AppRole[] = [
  'president',
  'secretary',
  'advisor_prayers',
  'advisor_social',
];
const DOCUMENT_MANAGER_ROLES: AppRole[] = ['president', 'secretary'];
export const DOCUMENTS_UPLOAD_DIR = resolve(process.cwd(), 'uploads', 'documents');
export const DOCUMENTS_PUBLIC_PREFIX = '/uploads/documents';

type MinuteRow = {
  id: string;
  title: string;
  meeting_type: MeetingType;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  chair_name: string;
  secretary: string;
  attendees: string[];
  apologies: string[];
  status: MinuteStatus;
  created_at: string;
  updated_at: string;
};

type AgendaRow = {
  id: string;
  minute_id: string;
  title: string;
  notes: string;
  presenter: string | null;
  position: number;
};

type ResolutionRow = {
  id: string;
  minute_id: string;
  text: string;
  moved_by: string;
  seconded_by: string;
  status: ResolutionStatus;
  votes_for: number | null;
  votes_against: number | null;
  votes_abstain: number | null;
  position: number;
};

type ActionRow = {
  id: string;
  minute_id: string;
  task: string;
  owner_id: string;
  due: string;
  done: boolean;
  position: number;
};

type DocumentRow = {
  id: string;
  title: string;
  category: DocCategory;
  description: string;
  owner_role: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

type DocumentVersionRow = {
  id: string;
  document_id: string;
  version: string;
  change_note: string;
  file_name: string;
  file_size: string;
  mime_type: string;
  url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type MinuteResponse = {
  id: string;
  title: string;
  meetingType: MeetingType;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  chair: string;
  secretary: string;
  attendees: string[];
  apologies: string[];
  status: MinuteStatus;
  agenda: { id: string; title: string; notes: string; presenter: string | null }[];
  resolutions: {
    id: string;
    text: string;
    movedBy: string;
    secondedBy: string;
    status: ResolutionStatus;
    votesFor: number | null;
    votesAgainst: number | null;
    votesAbstain: number | null;
  }[];
  actions: {
    id: string;
    task: string;
    ownerId: string;
    due: string;
    done: boolean;
  }[];
  createdAt: string;
  updatedAt: string;
};

export type DocumentResponse = {
  id: string;
  title: string;
  category: DocCategory;
  description: string;
  ownerRole: string;
  tags: string[];
  versions: DocumentVersionResponse[];
  createdAt: string;
  updatedAt: string;
};

export type DocumentVersionResponse = {
  id: string;
  documentId: string;
  version: string;
  changeNote: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string | null;
  uploadedBy: string;
  uploadedAt: string;
};

@Injectable()
export class MinutesService implements OnModuleInit {
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

  // --- Minutes ---

  async listMinutes(currentUser: { role: AppRole }): Promise<MinuteResponse[]> {
    if (!MINUTES_VIEWER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('You do not have access to minutes');
    }

    const minutesResult = await this.databaseService.query<MinuteRow>(
      `SELECT id, title, meeting_type::text AS meeting_type, date,
              start_time, end_time, location, chair_name, secretary,
              attendees, apologies, status::text AS status,
              created_at, updated_at
       FROM minutes ORDER BY date DESC, created_at DESC`,
    );
    if (minutesResult.rows.length === 0) return [];

    const ids = minutesResult.rows.map((r) => r.id);
    const [agenda, resolutions, actions] = await Promise.all([
      this.databaseService.query<AgendaRow>(
        `SELECT id, minute_id, title, notes, presenter, position
         FROM minutes_agenda WHERE minute_id = ANY($1::uuid[]) ORDER BY position ASC`,
        [ids],
      ),
      this.databaseService.query<ResolutionRow>(
        `SELECT id, minute_id, text, moved_by, seconded_by,
                status::text AS status, votes_for, votes_against, votes_abstain, position
         FROM minutes_resolutions WHERE minute_id = ANY($1::uuid[]) ORDER BY position ASC`,
        [ids],
      ),
      this.databaseService.query<ActionRow>(
        `SELECT id, minute_id, task, owner_id, due, done, position
         FROM minutes_actions WHERE minute_id = ANY($1::uuid[]) ORDER BY position ASC`,
        [ids],
      ),
    ]);

    return minutesResult.rows.map((m) =>
      this.mapMinute(
        m,
        agenda.rows.filter((a) => a.minute_id === m.id),
        resolutions.rows.filter((r) => r.minute_id === m.id),
        actions.rows.filter((a) => a.minute_id === m.id),
      ),
    );
  }

  async createMinute(
    dto: CreateMinuteDto,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    if (!MINUTES_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can create minutes');
    }

    const result = await this.databaseService.query<MinuteRow>(
      `
      INSERT INTO minutes (
        title, meeting_type, date, start_time, end_time, location,
        chair_name, secretary, attendees, apologies, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, title, meeting_type::text AS meeting_type, date,
                start_time, end_time, location, chair_name, secretary,
                attendees, apologies, status::text AS status,
                created_at, updated_at
      `,
      [
        dto.title.trim(),
        dto.meetingType,
        dto.date,
        dto.startTime,
        dto.endTime,
        dto.location.trim(),
        dto.chair.trim(),
        dto.secretary.trim(),
        dto.attendees ?? [],
        dto.apologies ?? [],
        dto.status ?? 'draft',
      ],
    );
    const created = this.mapMinute(result.rows[0], [], [], []);
    if (created.status === 'approved') {
      this.dispatchNotificationSafely(
        this.notificationsService.notifyMinuteCreated({
          minuteId: created.id,
          title: created.title,
          meetingDate: created.date,
          author: created.secretary || created.chair || 'Secretary',
        }),
        'MINUTE_NOTIFY_FAILED',
        { minute_id: created.id },
      );
    }
    return created;
  }

  async updateMinute(
    id: string,
    dto: UpdateMinuteDto,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    if (!MINUTES_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can update minutes');
    }
    const result = await this.databaseService.query<MinuteRow>(
      `
      UPDATE minutes SET
        title = COALESCE($2, title),
        meeting_type = COALESCE($3::meeting_type, meeting_type),
        date = COALESCE($4, date),
        start_time = COALESCE($5, start_time),
        end_time = COALESCE($6, end_time),
        location = COALESCE($7, location),
        chair_name = COALESCE($8, chair_name),
        secretary = COALESCE($9, secretary),
        attendees = COALESCE($10, attendees),
        apologies = COALESCE($11, apologies),
        status = COALESCE($12::minute_status, status),
        updated_at = now()
      WHERE id = $1
      RETURNING id, title, meeting_type::text AS meeting_type, date,
                start_time, end_time, location, chair_name, secretary,
                attendees, apologies, status::text AS status,
                created_at, updated_at
      `,
      [
        id,
        dto.title ?? null,
        dto.meetingType ?? null,
        dto.date ?? null,
        dto.startTime ?? null,
        dto.endTime ?? null,
        dto.location ?? null,
        dto.chair ?? null,
        dto.secretary ?? null,
        dto.attendees ?? null,
        dto.apologies ?? null,
        dto.status ?? null,
      ],
    );
    if (result.rowCount === 0) throw new NotFoundException('Minute not found');
    return this.loadFullMinute(result.rows[0].id);
  }

  async deleteMinute(
    id: string,
    currentUser: { role: AppRole },
  ): Promise<{ deletedMinuteId: string }> {
    if (!MINUTES_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can delete minutes');
    }
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM minutes WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) throw new NotFoundException('Minute not found');
    return { deletedMinuteId: id };
  }

  // --- Agenda / resolutions / actions ---

  async addAgendaItem(
    minuteId: string,
    dto: AgendaItemDto,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `
      INSERT INTO minutes_agenda (minute_id, title, notes, presenter, position)
      VALUES ($1, $2, $3, $4,
        COALESCE((SELECT MAX(position) + 1 FROM minutes_agenda WHERE minute_id = $1), 0))
      `,
      [minuteId, dto.title.trim(), dto.notes, dto.presenter ?? null],
    );
    return this.loadFullMinute(minuteId);
  }

  async removeAgendaItem(
    minuteId: string,
    itemId: string,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `DELETE FROM minutes_agenda WHERE id = $1 AND minute_id = $2`,
      [itemId, minuteId],
    );
    return this.loadFullMinute(minuteId);
  }

  async addResolution(
    minuteId: string,
    dto: CreateResolutionDto,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `
      INSERT INTO minutes_resolutions (
        minute_id, text, moved_by, seconded_by, status,
        votes_for, votes_against, votes_abstain, position
      ) VALUES ($1, $2, $3, $4, $5::resolution_status, $6, $7, $8,
        COALESCE((SELECT MAX(position) + 1 FROM minutes_resolutions WHERE minute_id = $1), 0))
      `,
      [
        minuteId,
        dto.text.trim(),
        dto.movedBy,
        dto.secondedBy,
        dto.status,
        dto.votesFor ?? null,
        dto.votesAgainst ?? null,
        dto.votesAbstain ?? null,
      ],
    );
    return this.loadFullMinute(minuteId);
  }

  async updateResolution(
    minuteId: string,
    resolutionId: string,
    dto: UpdateResolutionDto,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `
      UPDATE minutes_resolutions SET
        text = COALESCE($3, text),
        moved_by = COALESCE($4, moved_by),
        seconded_by = COALESCE($5, seconded_by),
        status = COALESCE($6::resolution_status, status),
        votes_for = COALESCE($7, votes_for),
        votes_against = COALESCE($8, votes_against),
        votes_abstain = COALESCE($9, votes_abstain)
      WHERE id = $1 AND minute_id = $2
      `,
      [
        resolutionId,
        minuteId,
        dto.text ?? null,
        dto.movedBy ?? null,
        dto.secondedBy ?? null,
        dto.status ?? null,
        dto.votesFor ?? null,
        dto.votesAgainst ?? null,
        dto.votesAbstain ?? null,
      ],
    );
    return this.loadFullMinute(minuteId);
  }

  async removeResolution(
    minuteId: string,
    resolutionId: string,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `DELETE FROM minutes_resolutions WHERE id = $1 AND minute_id = $2`,
      [resolutionId, minuteId],
    );
    return this.loadFullMinute(minuteId);
  }

  async addAction(
    minuteId: string,
    dto: CreateActionItemDto,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `
      INSERT INTO minutes_actions (minute_id, task, owner_id, due, done, position)
      VALUES ($1, $2, $3, $4, false,
        COALESCE((SELECT MAX(position) + 1 FROM minutes_actions WHERE minute_id = $1), 0))
      `,
      [minuteId, dto.task.trim(), dto.ownerId, dto.due],
    );
    return this.loadFullMinute(minuteId);
  }

  async toggleAction(
    minuteId: string,
    actionId: string,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `UPDATE minutes_actions SET done = NOT done WHERE id = $1 AND minute_id = $2`,
      [actionId, minuteId],
    );
    return this.loadFullMinute(minuteId);
  }

  async removeAction(
    minuteId: string,
    actionId: string,
    currentUser: { role: AppRole },
  ): Promise<MinuteResponse> {
    this.assertMinutesManager(currentUser.role);
    await this.databaseService.query(
      `DELETE FROM minutes_actions WHERE id = $1 AND minute_id = $2`,
      [actionId, minuteId],
    );
    return this.loadFullMinute(minuteId);
  }

  // --- Documents ---

  async storeDocumentFile(input: {
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
    currentUser: { sub: string; role: AppRole };
  }): Promise<{ publicPath: string; filename: string }> {
    if (!DOCUMENT_MANAGER_ROLES.includes(input.currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can upload documents');
    }

    await mkdir(DOCUMENTS_UPLOAD_DIR, { recursive: true });
    const ext = extname(input.originalName).toLowerCase() || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const fullPath = join(DOCUMENTS_UPLOAD_DIR, filename);
    await writeFile(fullPath, input.buffer);

    this.activityLogService.logSystem({
      action: `DOCUMENT_UPLOADED: ${filename}`,
      metadata: {
        uploader_id: input.currentUser.sub,
        size: input.size,
        mime_type: input.mimeType,
        original_name: input.originalName,
      },
    });

    return { publicPath: `${DOCUMENTS_PUBLIC_PREFIX}/${filename}`, filename };
  }

  async listDocuments(): Promise<DocumentResponse[]> {
    const docsResult = await this.databaseService.query<DocumentRow>(
      `SELECT id, title, category::text AS category, description, owner_role, tags,
              created_at, updated_at
       FROM documents ORDER BY created_at DESC`,
    );
    if (docsResult.rows.length === 0) return [];

    const ids = docsResult.rows.map((d) => d.id);
    const versionsResult = await this.databaseService.query<DocumentVersionRow>(
      `
      SELECT v.id, v.document_id, v.version, v.change_note, v.file_name,
             v.file_size::text AS file_size, v.mime_type, v.url,
             COALESCE(v.uploaded_by, u.display_name, u.email, 'System') AS uploaded_by,
             v.uploaded_at
      FROM document_versions v
      LEFT JOIN users u ON u.id = v.uploaded_by_user_id
      WHERE v.document_id = ANY($1::uuid[])
      ORDER BY v.uploaded_at ASC
      `,
      [ids],
    );

    const versionsByDoc = new Map<string, DocumentVersionResponse[]>();
    for (const v of versionsResult.rows) {
      const arr = versionsByDoc.get(v.document_id) ?? [];
      arr.push(this.mapVersion(v));
      versionsByDoc.set(v.document_id, arr);
    }

    return docsResult.rows.map((d) => this.mapDocument(d, versionsByDoc.get(d.id) ?? []));
  }

  async createDocument(
    dto: CreateDocumentDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<DocumentResponse> {
    if (!DOCUMENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can add documents');
    }

    const uploadedByName =
      dto.initialVersion.uploadedBy?.trim() ||
      (await this.resolveDisplayName(currentUser.sub, currentUser.email));

    return this.databaseService.withTransaction(async (client) => {
      const doc = await client.query<DocumentRow>(
        `
        INSERT INTO documents (title, category, description, owner_role, tags)
        VALUES ($1, $2::doc_category, $3, $4, $5)
        RETURNING id, title, category::text AS category, description, owner_role, tags,
                  created_at, updated_at
        `,
        [
          dto.title.trim(),
          dto.category,
          dto.description,
          dto.ownerRole.trim(),
          dto.tags.map((t) => t.trim()).filter(Boolean),
        ],
      );

      const version = await client.query<DocumentVersionRow>(
        `
        INSERT INTO document_versions (
          document_id, version, change_note, file_name, file_size, mime_type, url,
          uploaded_by_user_id, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, document_id, version, change_note, file_name,
                  file_size::text AS file_size, mime_type, url,
                  uploaded_by, uploaded_at
        `,
        [
          doc.rows[0].id,
          dto.initialVersion.version,
          dto.initialVersion.changeNote,
          dto.initialVersion.fileName,
          dto.initialVersion.fileSize,
          dto.initialVersion.mimeType,
          dto.initialVersion.url ?? null,
          currentUser.sub,
          uploadedByName,
        ],
      );

      return this.mapDocument(doc.rows[0], [this.mapVersion(version.rows[0])]);
    });
  }

  async addDocumentVersion(
    documentId: string,
    dto: AddDocumentVersionDto,
    currentUser: { sub: string; email: string; role: AppRole },
  ): Promise<DocumentResponse> {
    if (!DOCUMENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can add document versions');
    }
    const uploadedByName = await this.resolveDisplayName(currentUser.sub, currentUser.email);

    const result = await this.databaseService.query<{ id: string }>(
      `
      INSERT INTO document_versions (
        document_id, version, change_note, file_name, file_size, mime_type, url,
        uploaded_by_user_id, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
      `,
      [
        documentId,
        dto.version,
        dto.changeNote,
        dto.fileName,
        dto.fileSize,
        dto.mimeType,
        dto.url ?? null,
        currentUser.sub,
        uploadedByName,
      ],
    );
    if (result.rowCount === 0) throw new NotFoundException('Document not found');
    return this.loadDocument(documentId);
  }

  async removeDocument(
    documentId: string,
    currentUser: { role: AppRole },
  ): Promise<{ deletedDocumentId: string }> {
    if (!DOCUMENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can delete documents');
    }
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM documents WHERE id = $1 RETURNING id`,
      [documentId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Document not found');
    return { deletedDocumentId: documentId };
  }

  async removeDocumentVersion(
    documentId: string,
    versionId: string,
    currentUser: { role: AppRole },
  ): Promise<DocumentResponse> {
    if (!DOCUMENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only president and secretary can delete versions');
    }
    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM document_versions WHERE id = $1 AND document_id = $2 RETURNING id`,
      [versionId, documentId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Version not found');
    return this.loadDocument(documentId);
  }

  // --- Helpers ---

  private assertMinutesManager(role: AppRole): void {
    if (!MINUTES_MANAGER_ROLES.includes(role)) {
      throw new ForbiddenException('Only president and secretary can update minutes');
    }
  }

  private async loadFullMinute(id: string): Promise<MinuteResponse> {
    const minuteResult = await this.databaseService.query<MinuteRow>(
            `SELECT id, title, meeting_type::text AS meeting_type, date,
              start_time, end_time, location, chair_name, secretary,
              attendees, apologies, status::text AS status,
              created_at, updated_at
             FROM minutes WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (minuteResult.rowCount === 0) throw new NotFoundException('Minute not found');

    const [agenda, resolutions, actions] = await Promise.all([
      this.databaseService.query<AgendaRow>(
        `SELECT id, minute_id, title, notes, presenter, position
         FROM minutes_agenda WHERE minute_id = $1 ORDER BY position ASC`,
        [id],
      ),
      this.databaseService.query<ResolutionRow>(
        `SELECT id, minute_id, text, moved_by, seconded_by,
                status::text AS status, votes_for, votes_against, votes_abstain, position
         FROM minutes_resolutions WHERE minute_id = $1 ORDER BY position ASC`,
        [id],
      ),
      this.databaseService.query<ActionRow>(
        `SELECT id, minute_id, task, owner_id, due, done, position
         FROM minutes_actions WHERE minute_id = $1 ORDER BY position ASC`,
        [id],
      ),
    ]);

    return this.mapMinute(minuteResult.rows[0], agenda.rows, resolutions.rows, actions.rows);
  }

  private async loadDocument(id: string): Promise<DocumentResponse> {
    const docResult = await this.databaseService.query<DocumentRow>(
      `SELECT id, title, category::text AS category, description, owner_role, tags,
              created_at, updated_at
       FROM documents WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (docResult.rowCount === 0) throw new NotFoundException('Document not found');

    const versions = await this.databaseService.query<DocumentVersionRow>(
      `
      SELECT v.id, v.document_id, v.version, v.change_note, v.file_name,
             v.file_size::text AS file_size, v.mime_type, v.url,
             COALESCE(v.uploaded_by, u.display_name, u.email, 'System') AS uploaded_by,
             v.uploaded_at
      FROM document_versions v
      LEFT JOIN users u ON u.id = v.uploaded_by_user_id
      WHERE v.document_id = $1
      ORDER BY v.uploaded_at ASC
      `,
      [id],
    );

    return this.mapDocument(
      docResult.rows[0],
      versions.rows.map((v) => this.mapVersion(v)),
    );
  }

  private async resolveDisplayName(userId: string, fallbackEmail: string) {
    const result = await this.databaseService.query<{
      display_name: string | null;
      email: string | null;
    }>(`SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (row?.display_name?.trim()) return row.display_name.trim();
    if (row?.email?.trim()) return row.email.trim();
    return fallbackEmail || 'System';
  }

  private mapMinute(
    row: MinuteRow,
    agenda: AgendaRow[],
    resolutions: ResolutionRow[],
    actions: ActionRow[],
  ): MinuteResponse {
    return {
      id: row.id,
      title: row.title,
      meetingType: row.meeting_type,
      date: toDateOnlyString(row.date) as string,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      location: row.location,
      chair: row.chair_name,
      secretary: row.secretary,
      attendees: row.attendees ?? [],
      apologies: row.apologies ?? [],
      status: row.status,
      agenda: agenda.map((a) => ({
        id: a.id,
        title: a.title,
        notes: a.notes,
        presenter: a.presenter,
      })),
      resolutions: resolutions.map((r) => ({
        id: r.id,
        text: r.text,
        movedBy: r.moved_by,
        secondedBy: r.seconded_by,
        status: r.status,
        votesFor: r.votes_for,
        votesAgainst: r.votes_against,
        votesAbstain: r.votes_abstain,
      })),
      actions: actions.map((a) => ({
        id: a.id,
        task: a.task,
        ownerId: a.owner_id,
        due: toDateOnlyString(a.due) as string,
        done: a.done,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapDocument(
    row: DocumentRow,
    versions: DocumentVersionResponse[],
  ): DocumentResponse {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      description: row.description,
      ownerRole: row.owner_role,
      tags: row.tags ?? [],
      versions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapVersion(row: DocumentVersionRow): DocumentVersionResponse {
    return {
      id: row.id,
      documentId: row.document_id,
      version: row.version,
      changeNote: row.change_note,
      fileName: row.file_name,
      fileSize: Number(row.file_size),
      mimeType: row.mime_type,
      url: row.url,
      uploadedBy: row.uploaded_by ?? 'System',
      uploadedAt: row.uploaded_at,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_type') THEN
          CREATE TYPE meeting_type AS ENUM ('executive','general','advisors','committee','agm');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'minute_status') THEN
          CREATE TYPE minute_status AS ENUM ('draft','circulated','approved');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'resolution_status') THEN
          CREATE TYPE resolution_status AS ENUM ('proposed','passed','rejected','tabled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_category') THEN
          CREATE TYPE doc_category AS ENUM ('constitution','handover','policy','report','sermon','form','other');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS minutes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        meeting_type meeting_type NOT NULL,
        date date NOT NULL DEFAULT CURRENT_DATE,
        start_time time NOT NULL,
        end_time time NOT NULL,
        location text NOT NULL,
        chair_name text NOT NULL DEFAULT '',
        secretary text NOT NULL,
        attendees text[] NOT NULL DEFAULT ARRAY[]::text[],
        apologies text[] NOT NULL DEFAULT ARRAY[]::text[],
        status minute_status NOT NULL DEFAULT 'draft',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='minutes' AND column_name='chair')
           AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='minutes' AND column_name='chair_name') THEN
          ALTER TABLE minutes RENAME COLUMN chair TO chair_name;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='minutes' AND column_name='chair_name') THEN
          ALTER TABLE minutes ADD COLUMN chair_name text NOT NULL DEFAULT '';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='minutes' AND column_name='date') THEN
          ALTER TABLE minutes ADD COLUMN date date NOT NULL DEFAULT CURRENT_DATE;
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS minutes_agenda (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
        title text NOT NULL,
        notes text NOT NULL,
        presenter text,
        position int NOT NULL DEFAULT 0
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS minute_participants (
        minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
        member_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
        kind text NOT NULL DEFAULT 'attendee',
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (minute_id, member_id)
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS minutes_resolutions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
        text text NOT NULL,
        moved_by text NOT NULL,
        seconded_by text NOT NULL,
        status resolution_status NOT NULL DEFAULT 'proposed',
        votes_for int,
        votes_against int,
        votes_abstain int,
        position int NOT NULL DEFAULT 0
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS minutes_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        minute_id uuid NOT NULL REFERENCES minutes(id) ON DELETE CASCADE,
        task text NOT NULL,
        owner_id text NOT NULL,
        due date NOT NULL,
        done boolean NOT NULL DEFAULT false,
        position int NOT NULL DEFAULT 0
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        category doc_category NOT NULL,
        description text NOT NULL DEFAULT '',
        owner_role text NOT NULL,
        tags text[] NOT NULL DEFAULT ARRAY[]::text[],
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[]
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS document_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        version text NOT NULL,
        change_note text NOT NULL DEFAULT '',
        file_name text NOT NULL,
        file_size bigint NOT NULL DEFAULT 0,
        mime_type text NOT NULL,
        url text,
        uploaded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        uploaded_by text,
        uploaded_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }
}
