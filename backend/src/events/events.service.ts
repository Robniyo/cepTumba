import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { AppRole } from '../auth/auth-role.type';
import { toDateOnlyString } from '../common/date-utils';
import { buildExportStamp, exportTable, ExportColumn, ExportFormat } from '../common/export-utils';
import { DatabaseService } from '../database/database.service';
import { ActivityLogService } from '../logging/activity-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AddMaterialDto } from './dto/add-material.dto';
import { SetNotesDto } from './dto/set-notes.dto';
import {
  AttendanceMethod,
  AttendanceStatus,
  EventType,
} from './event.types';

const EVENT_MANAGER_ROLES: AppRole[] = [
  'president',
  'secretary',
  'vp_prayers',
  'vp_social',
];

const ATTENDANCE_MANAGER_ROLES: AppRole[] = [
  'president',
  'secretary',
  'vp_prayers',
  'vp_social',
];
export const EVENT_MATERIALS_UPLOAD_DIR = resolve(process.cwd(), 'uploads', 'events');
export const EVENT_MATERIALS_PUBLIC_PREFIX = '/uploads/events';

type EventRow = {
  id: string;
  title: string;
  type: EventType;
  description: string | null;
  location: string;
  start_time: string;
  end_time: string;
  speaker: string | null;
  recurring: boolean;
  weekday: number | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type MaterialRow = {
  id: string;
  event_id: string;
  name: string;
  type: string;
  size: number;
  url: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

type AttendanceRow = {
  event_id: string;
  date: string;
  member_id: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  checked_in_at: string;
};

export type EventResponse = {
  id: string;
  title: string;
  type: EventType;
  description: string | null;
  location: string;
  startTime: string;
  endTime: string;
  speaker: string | null;
  recurring: boolean;
  weekday: number | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  materials: MaterialResponse[];
  createdAt: string;
  updatedAt: string;
};

export type MaterialResponse = {
  id: string;
  eventId: string;
  name: string;
  type: string;
  size: number;
  url: string | null;
  uploadedAt: string;
};

export type AttendanceResponse = {
  eventId: string;
  date: string;
  memberId: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  checkedInAt: string;
};

type EventExportRow = {
  id: string;
  title: string;
  type: EventType;
  description: string | null;
  location: string;
  startDate: string;
  startTime: string;
  endDate: string | null;
  endTime: string;
  speaker: string | null;
  recurring: boolean;
  weekday: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// Event schedule helper types
type EventSchedule = {
  recurring: boolean;
  weekday: number | null;
  startDate: string;
  endDate: string | null;
};

@Injectable()
export class EventsService implements OnModuleInit {
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

  private async resolveDisplayName(userId: string): Promise<string> {
    const result = await this.databaseService.query<{ display_name: string | null; email: string | null }>(
      `SELECT display_name, email FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    return result.rows[0]?.display_name?.trim() || result.rows[0]?.email?.trim() || 'A leader';
  }

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
  }

  async listPublicEvents(limit: number = 6): Promise<EventResponse[]> {
    const eventsResult = await this.databaseService.query<EventRow>(
      `
      SELECT * FROM events
      WHERE start_date >= CURRENT_DATE OR (recurring = true AND end_date IS NULL OR end_date >= CURRENT_DATE)
      ORDER BY start_date ASC, start_time ASC
      LIMIT $1
      `,
      [limit],
    );

    if (eventsResult.rows.length === 0) return [];

    return eventsResult.rows.map((row) => this.mapEvent(row, []));
  }

  async listEvents(): Promise<EventResponse[]> {
    const eventsResult = await this.databaseService.query<EventRow>(
      `SELECT * FROM events ORDER BY start_date DESC, start_time ASC`,
    );

    if (eventsResult.rows.length === 0) return [];

    const ids = eventsResult.rows.map((r) => r.id);
    const materialsResult = await this.databaseService.query<MaterialRow>(
      `SELECT * FROM event_materials WHERE event_id = ANY($1::uuid[]) ORDER BY uploaded_at DESC`,
      [ids],
    );

    const materialsByEvent = new Map<string, MaterialResponse[]>();
    for (const m of materialsResult.rows) {
      const list = materialsByEvent.get(m.event_id) ?? [];
      list.push(this.mapMaterial(m));
      materialsByEvent.set(m.event_id, list);
    }

    return eventsResult.rows.map((row) =>
      this.mapEvent(row, materialsByEvent.get(row.id) ?? []),
    );
  }

  async exportEvents(
    format: ExportFormat,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    const eventsResult = await this.databaseService.query<EventRow>(
      `SELECT * FROM events ORDER BY start_date DESC, start_time ASC`,
    );

    const items: EventExportRow[] = eventsResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
      description: row.description,
      location: row.location,
      startDate: toDateOnlyString(row.start_date) as string,
      startTime: row.start_time.slice(0, 5),
      endDate: toDateOnlyString(row.end_date),
      endTime: row.end_time.slice(0, 5),
      speaker: row.speaker,
      recurring: row.recurring,
      weekday: row.weekday,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const columns: ExportColumn<EventExportRow>[] = [
      { key: 'id', header: 'ID' },
      { key: 'title', header: 'Title' },
      { key: 'type', header: 'Type' },
      { key: 'description', header: 'Description' },
      { key: 'location', header: 'Location' },
      { key: 'startDate', header: 'Start Date' },
      { key: 'startTime', header: 'Start Time' },
      { key: 'endDate', header: 'End Date' },
      { key: 'endTime', header: 'End Time' },
      { key: 'speaker', header: 'Speaker' },
      { key: 'recurring', header: 'Recurring' },
      { key: 'weekday', header: 'Weekday' },
      { key: 'notes', header: 'Notes' },
      { key: 'createdAt', header: 'Created At' },
      { key: 'updatedAt', header: 'Updated At' },
    ];

    const { buffer, contentType, extension } = await exportTable(
      'Events',
      items,
      columns,
      format,
    );
    const stamp = buildExportStamp();
    return { buffer, contentType, fileName: `events_${stamp}.${extension}` };
  }

  async createEvent(
    dto: CreateEventDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<EventResponse> {
    if (!EVENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can create events');
    }

    this.validateRecurrence(dto.recurring, dto.weekday);
    this.validateTimeRange(dto.startTime, dto.endTime);
    this.validateStartDateNotInPast(dto.startDate);
    // Use transaction + advisory lock to prevent race conditions where two
    // concurrent requests both see no conflict and insert simultaneously.
    const createdRow = await this.databaseService.withTransaction(async (client: PoolClient) => {
      const lockKey = this.computeLockKey(
        `${dto.recurring ? 'R' : 'O'}|${dto.recurring ? String(dto.weekday ?? '') : dto.startDate}|${dto.startTime}`,
      );
      await client.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey]);

      // run conflict check using the same client (so the advisory lock serializes checks)
      await this.assertNoScheduleConflict(
        {
          recurring: dto.recurring,
          weekday: dto.recurring ? dto.weekday ?? null : null,
          startDate: dto.startDate,
          endDate: dto.endDate ?? null,
        },
        dto.startTime,
        undefined,
        client,
      );

      const r = await client.query<EventRow>(
        `
        INSERT INTO events (
          title, type, description, location, start_time, end_time,
          speaker, recurring, weekday, start_date, end_date, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
        `,
        [
          dto.title.trim(),
          dto.type,
          dto.description ?? null,
          dto.location.trim(),
          dto.startTime,
          dto.endTime,
          dto.speaker ?? null,
          dto.recurring,
          dto.recurring ? dto.weekday ?? null : null,
          dto.startDate,
          dto.endDate ?? null,
          dto.notes ?? null,
          currentUser.sub,
        ],
      );
      return r.rows[0];
    });

    this.activityLogService.logSystem({
      action: `EVENT_CREATE: ${createdRow.id}`,
      metadata: { event_id: createdRow.id, actor_id: currentUser.sub },
    });

    const created = this.mapEvent(createdRow, []);
    void (async () => {
      const organizer = await this.resolveDisplayName(currentUser.sub);
      const startsAt = `${dto.startDate}T${dto.startTime}`;
      const endsAt = dto.endDate
        ? `${dto.endDate}T${dto.endTime}`
        : `${dto.startDate}T${dto.endTime}`;
      this.dispatchNotificationSafely(
        this.notificationsService.notifyEventCreated({
          eventId: created.id,
          title: created.title,
          description: created.description,
          location: created.location,
          startsAt,
          endsAt,
          organizer,
        }),
        'EVENT_NOTIFY_FAILED',
        { event_id: created.id },
      );
    })();
    return created;
  }

  async updateEvent(
    eventId: string,
    dto: UpdateEventDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<EventResponse> {
    if (!EVENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can update events');
    }

    const existing = await this.findEventOrFail(eventId);

    const recurring = dto.recurring ?? existing.recurring;
    const weekday = dto.weekday !== undefined ? dto.weekday : existing.weekday;
    this.validateRecurrence(recurring, weekday ?? undefined);

    const startTime = dto.startTime ?? existing.start_time;
    const endTime = dto.endTime ?? existing.end_time;
    this.validateTimeRange(startTime, endTime);

    const startDate = dto.startDate ?? existing.start_date;
    const endDate = dto.endDate !== undefined ? dto.endDate : existing.end_date;
    await this.assertNoScheduleConflict(
      {
        recurring,
        weekday: recurring ? weekday ?? null : null,
        startDate,
        endDate,
      },
      startTime,
      eventId,
    );

    const result = await this.databaseService.query<EventRow>(
      `
      UPDATE events SET
        title = COALESCE($2, title),
        type = COALESCE($3::event_type, type),
        description = CASE WHEN $4::boolean THEN $5 ELSE description END,
        location = COALESCE($6, location),
        start_time = COALESCE($7, start_time),
        end_time = COALESCE($8, end_time),
        speaker = CASE WHEN $9::boolean THEN $10 ELSE speaker END,
        recurring = COALESCE($11, recurring),
        weekday = CASE WHEN COALESCE($11, recurring) THEN COALESCE($12, weekday) ELSE NULL END,
        start_date = COALESCE($13, start_date),
        end_date = CASE WHEN $14::boolean THEN $15 ELSE end_date END,
        notes = CASE WHEN $16::boolean THEN $17 ELSE notes END,
        updated_at = now()
      WHERE id = $1
      RETURNING *
      `,
      [
        eventId,
        dto.title ?? null,
        dto.type ?? null,
        dto.description !== undefined,
        dto.description ?? null,
        dto.location ?? null,
        dto.startTime ?? null,
        dto.endTime ?? null,
        dto.speaker !== undefined,
        dto.speaker ?? null,
        dto.recurring ?? null,
        dto.weekday ?? null,
        dto.startDate ?? null,
        dto.endDate !== undefined,
        dto.endDate ?? null,
        dto.notes !== undefined,
        dto.notes ?? null,
      ],
    );

    const materials = await this.loadMaterials(eventId);
    this.activityLogService.logSystem({
      action: `EVENT_UPDATE: ${eventId}`,
      metadata: { event_id: eventId, actor_id: currentUser.sub },
    });

    return this.mapEvent(result.rows[0], materials);
  }

  async deleteEvent(
    eventId: string,
    currentUser: { sub: string; role: AppRole },
  ): Promise<{ deletedEventId: string }> {
    if (!EVENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can delete events');
    }

    const result = await this.databaseService.query<{ id: string }>(
      `DELETE FROM events WHERE id = $1 RETURNING id`,
      [eventId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Event not found');
    }

    this.activityLogService.logSystem({
      action: `EVENT_DELETE: ${eventId}`,
      metadata: { event_id: eventId, actor_id: currentUser.sub },
    });

    return { deletedEventId: eventId };
  }

  async setEventNotes(
    eventId: string,
    dto: SetNotesDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<EventResponse> {
    if (!EVENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can edit event notes');
    }

    const result = await this.databaseService.query<EventRow>(
      `UPDATE events SET notes = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [eventId, dto.notes],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Event not found');
    }

    const materials = await this.loadMaterials(eventId);
    return this.mapEvent(result.rows[0], materials);
  }

  async listAttendance(eventId: string): Promise<AttendanceResponse[]> {
    const result = await this.databaseService.query<AttendanceRow>(
      `SELECT * FROM event_attendance WHERE event_id = $1 ORDER BY date DESC, checked_in_at DESC`,
      [eventId],
    );
    return result.rows.map((r) => this.mapAttendance(r));
  }

  async markAttendance(
    eventId: string,
    dto: MarkAttendanceDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<AttendanceResponse> {
    const isSelfCheckIn = dto.method === 'self';
    if (!isSelfCheckIn && !ATTENDANCE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can mark attendance manually');
    }

    await this.findEventOrFail(eventId);

    const result = await this.databaseService.query<AttendanceRow>(
      `
      INSERT INTO event_attendance (
        event_id, date, member_id, status, method, checked_in_at
      ) VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (event_id, date, member_id) DO UPDATE SET
        status = EXCLUDED.status,
        method = EXCLUDED.method,
        checked_in_at = now()
      RETURNING *
      `,
      [eventId, dto.date, dto.memberId, dto.status, dto.method],
    );

    return this.mapAttendance(result.rows[0]);
  }

  async removeAttendance(
    eventId: string,
    date: string,
    memberId: string,
    currentUser: { role: AppRole },
  ): Promise<{ ok: true }> {
    if (!ATTENDANCE_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can remove attendance');
    }

    const result = await this.databaseService.query(
      `DELETE FROM event_attendance WHERE event_id = $1 AND date = $2 AND member_id = $3`,
      [eventId, date, memberId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Attendance record not found');
    }

    return { ok: true };
  }

  async storeMaterialFile(input: {
    eventId: string;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
    currentUser: { sub: string; role: AppRole };
  }): Promise<{ publicPath: string; filename: string }> {
    if (!EVENT_MANAGER_ROLES.includes(input.currentUser.role)) {
      throw new ForbiddenException('Only leaders can upload event materials');
    }

    await this.findEventOrFail(input.eventId);
    await mkdir(EVENT_MATERIALS_UPLOAD_DIR, { recursive: true });
    const ext = extname(input.originalName).toLowerCase() || '.bin';
    const filename = `${randomUUID()}${ext}`;
    const fullPath = join(EVENT_MATERIALS_UPLOAD_DIR, filename);
    await writeFile(fullPath, input.buffer);

    this.activityLogService.logSystem({
      action: `EVENT_MATERIAL_UPLOADED: ${filename}`,
      metadata: {
        event_id: input.eventId,
        uploader_id: input.currentUser.sub,
        size: input.size,
        mime_type: input.mimeType,
        original_name: input.originalName,
      },
    });

    return { publicPath: `${EVENT_MATERIALS_PUBLIC_PREFIX}/${filename}`, filename };
  }

  async addMaterial(
    eventId: string,
    dto: AddMaterialDto,
    currentUser: { sub: string; role: AppRole },
  ): Promise<MaterialResponse> {
    if (!EVENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can upload event materials');
    }

    await this.findEventOrFail(eventId);

    const result = await this.databaseService.query<MaterialRow>(
      `
      INSERT INTO event_materials (event_id, name, type, size, url, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [eventId, dto.name, dto.type, dto.size, dto.url ?? null, currentUser.sub],
    );

    return this.mapMaterial(result.rows[0]);
  }

  async removeMaterial(
    eventId: string,
    materialId: string,
    currentUser: { role: AppRole },
  ): Promise<{ ok: true }> {
    if (!EVENT_MANAGER_ROLES.includes(currentUser.role)) {
      throw new ForbiddenException('Only leaders can remove event materials');
    }

    const result = await this.databaseService.query(
      `DELETE FROM event_materials WHERE id = $1 AND event_id = $2`,
      [materialId, eventId],
    );

    if (result.rowCount === 0) {
      throw new NotFoundException('Material not found');
    }

    return { ok: true };
  }

  private async findEventOrFail(eventId: string): Promise<EventRow> {
    const result = await this.databaseService.query<EventRow>(
      `SELECT * FROM events WHERE id = $1 LIMIT 1`,
      [eventId],
    );
    if (result.rowCount === 0) {
      throw new NotFoundException('Event not found');
    }
    return result.rows[0];
  }

  private async loadMaterials(eventId: string): Promise<MaterialResponse[]> {
    const result = await this.databaseService.query<MaterialRow>(
      `SELECT * FROM event_materials WHERE event_id = $1 ORDER BY uploaded_at DESC`,
      [eventId],
    );
    return result.rows.map((r) => this.mapMaterial(r));
  }

  private validateRecurrence(recurring: boolean, weekday?: number | null): void {
    if (recurring && (weekday === undefined || weekday === null)) {
      throw new BadRequestException('Recurring events must include a weekday (0-6)');
    }
  }

  private validateTimeRange(startTime: string, endTime: string): void {
    if (endTime <= startTime) {
      throw new BadRequestException('endTime must be after startTime');
    }
  }

  private validateStartDateNotInPast(startDate: string): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(`${startDate}T00:00:00Z`);
    if (eventDate < today) {
      throw new BadRequestException('startDate cannot be in the past');
    }
  }

  private async assertNoScheduleConflict(
    candidate: EventSchedule,
    startTime: string,
    excludeEventId?: string,
    client?: PoolClient,
  ): Promise<void> {
    const q = async (text: string, params: unknown[]) => {
      if (client) return client.query(text, params);
      return this.databaseService.query(text, params);
    };

    if (!candidate.recurring) {
      const result = await q(
        `
        SELECT id FROM events
        WHERE start_time = $1::time
          AND ($3::uuid IS NULL OR id <> $3::uuid)
          AND (
            (recurring = false AND $2::date BETWEEN start_date AND COALESCE(end_date, start_date))
            OR (recurring = true AND weekday = EXTRACT(DOW FROM $2::date)::int AND $2::date >= start_date AND (end_date IS NULL OR $2::date <= end_date))
          )
        LIMIT 1
        `,
        [startTime, candidate.startDate, excludeEventId ?? null],
      );

      if ((result.rowCount ?? 0) > 0) {
        throw new ConflictException('Another event already exists on the same day and time');
      }
      return;
    }

    const weekday = candidate.weekday as number;
    const start = candidate.startDate;
    const end = candidate.endDate ?? candidate.startDate;

    const result = await q(
      `
      SELECT id FROM events
      WHERE start_time = $1::time
        AND ($5::uuid IS NULL OR id <> $5::uuid)
        AND (
          (recurring = true AND weekday = $2 AND NOT (COALESCE(end_date, start_date) < $3::date OR start_date > $4::date))
          OR (recurring = false AND EXTRACT(DOW FROM start_date)::int = $2 AND start_date BETWEEN $3::date AND $4::date)
        )
      LIMIT 1
      `,
      [startTime, weekday, start, end, excludeEventId ?? null],
    );

    if ((result.rowCount ?? 0) > 0) {
      throw new ConflictException('Another event already exists on the same day and time');
    }
  }

  private computeLockKey(value: string): string {
    // Compute a stable 64-bit-ish integer from a string using BigInt.
    let h = 1469598103934665603n; // FNV offset basis
    for (let i = 0; i < value.length; i++) {
      h ^= BigInt(value.charCodeAt(i));
      h = (h * 1099511628211n) & ((1n << 63n) - 1n);
    }
    // keep value in signed 64-bit range
    return h.toString();
  }

  private mapEvent(row: EventRow, materials: MaterialResponse[]): EventResponse {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      description: row.description,
      location: row.location,
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      speaker: row.speaker,
      recurring: row.recurring,
      weekday: row.weekday,
      startDate: toDateOnlyString(row.start_date) as string,
      endDate: toDateOnlyString(row.end_date),
      notes: row.notes,
      materials,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapMaterial(row: MaterialRow): MaterialResponse {
    return {
      id: row.id,
      eventId: row.event_id,
      name: row.name,
      type: row.type,
      size: Number(row.size),
      url: row.url,
      uploadedAt: row.uploaded_at,
    };
  }

  private mapAttendance(row: AttendanceRow): AttendanceResponse {
    return {
      eventId: row.event_id,
      date: toDateOnlyString(row.date) as string,
      memberId: row.member_id,
      status: row.status,
      method: row.method,
      checkedInAt: row.checked_in_at,
    };
  }

  private async ensureSchema(): Promise<void> {
    await this.databaseService.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_type') THEN
          CREATE TYPE event_type AS ENUM ('prayer','study','service','social','outreach','meeting');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
          CREATE TYPE attendance_status AS ENUM ('present','late','absent');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_method') THEN
          CREATE TYPE attendance_method AS ENUM ('manual','qr','self');
        END IF;
      END $$;
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        type event_type NOT NULL,
        description text,
        location text NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        speaker text,
        recurring boolean NOT NULL DEFAULT false,
        weekday smallint CHECK (weekday IS NULL OR (weekday >= 0 AND weekday <= 6)),
        start_date date NOT NULL,
        end_date date,
        notes text,
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS event_materials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name text NOT NULL,
        type text NOT NULL,
        size bigint NOT NULL DEFAULT 0,
        url text,
        uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
        uploaded_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await this.databaseService.query(`
      CREATE TABLE IF NOT EXISTS event_attendance (
        event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        date date NOT NULL DEFAULT CURRENT_DATE,
        member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        status attendance_status NOT NULL,
        method attendance_method NOT NULL,
        checked_in_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (event_id, date, member_id)
      )
    `);
    await this.databaseService.query(`
      ALTER TABLE event_attendance ADD COLUMN IF NOT EXISTS date date NOT NULL DEFAULT CURRENT_DATE
    `);

    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS events_start_date_idx ON events (start_date DESC)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS event_attendance_date_idx ON event_attendance (date DESC)`,
    );
    await this.databaseService.query(
      `CREATE INDEX IF NOT EXISTS event_attendance_member_idx ON event_attendance (member_id)`,
    );
  }
}
