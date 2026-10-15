import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import type { Response } from 'express';
import { extname } from 'path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { parseExportFormat } from '../common/export-utils';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';
import { AddMaterialDto } from './dto/add-material.dto';
import { SetNotesDto } from './dto/set-notes.dto';

const ALLOWED_MATERIAL_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/mp3',
]);
const ALLOWED_MATERIAL_EXT = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.pdf',
  '.doc',
  '.docx',
  '.mp3',
]);
const MAX_MATERIAL_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('public')
  async listPublicEvents(@Query('limit') limit?: string) {
    const events = await this.eventsService.listPublicEvents(limit ? parseInt(limit) : 6);
    return { items: events };
  }

  @UseGuards(AccessTokenGuard)
  @Get()
  async listEvents() {
    const events = await this.eventsService.listEvents();
    return { items: events };
  }

  @UseGuards(AccessTokenGuard)
  @Get('export')
  async exportEvents(
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const parsedFormat = parseExportFormat(format);
    const { buffer, contentType, fileName } = await this.eventsService.exportEvents(
      parsedFormat,
    );

    response.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });

    return new StreamableFile(buffer);
  }

  @Post()
  @UseGuards(AccessTokenGuard)
  async createEvent(
    @Body() dto: CreateEventDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const event = await this.eventsService.createEvent(dto, currentUser);
    return { event };
  }

  @Patch(':eventId')
  @UseGuards(AccessTokenGuard)
  async updateEvent(
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const event = await this.eventsService.updateEvent(eventId, dto, currentUser);
    return { event };
  }

  @Delete(':eventId')
  @UseGuards(AccessTokenGuard)
  async deleteEvent(
    @Param('eventId') eventId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.eventsService.deleteEvent(eventId, currentUser);
  }

  @Patch(':eventId/notes')
  @UseGuards(AccessTokenGuard)
  async setNotes(
    @Param('eventId') eventId: string,
    @Body() dto: SetNotesDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const event = await this.eventsService.setEventNotes(eventId, dto, currentUser);
    return { event };
  }

  @Get(':eventId/attendance')
  @UseGuards(AccessTokenGuard)
  async listAttendance(@Param('eventId') eventId: string) {
    const items = await this.eventsService.listAttendance(eventId);
    return { items };
  }

  @Post(':eventId/attendance')
  @UseGuards(AccessTokenGuard)
  async markAttendance(
    @Param('eventId') eventId: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const attendance = await this.eventsService.markAttendance(eventId, dto, currentUser);
    return { attendance };
  }

  @Delete(':eventId/attendance')
  @UseGuards(AccessTokenGuard)
  async removeAttendance(
    @Param('eventId') eventId: string,
    @Query('date') date: string,
    @Query('memberId') memberId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.eventsService.removeAttendance(eventId, date, memberId, currentUser);
  }

  @Post(':eventId/materials')
  @UseGuards(AccessTokenGuard)
  async addMaterial(
    @Param('eventId') eventId: string,
    @Body() dto: AddMaterialDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const material = await this.eventsService.addMaterial(eventId, dto, currentUser);
    return { material };
  }

  @Post(':eventId/materials/upload')
  @UseGuards(AccessTokenGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_MATERIAL_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_MATERIAL_MIME.has(file.mimetype) || !ALLOWED_MATERIAL_EXT.has(ext)) {
          return cb(
            new BadRequestException(
              'Only PDF, DOC, DOCX, JPG, PNG, and MP3 files up to 10MB are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadMaterial(
    @Param('eventId') eventId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_MATERIAL_BYTES) {
      throw new BadRequestException('File exceeds 10MB limit');
    }

    const stored = await this.eventsService.storeMaterialFile({
      eventId,
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      currentUser: { sub: currentUser.sub, role: currentUser.role },
    });

    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const absoluteUrl = `${protocol}://${host}${stored.publicPath}`;

    return {
      file: {
        url: absoluteUrl,
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
      },
    };
  }

  @Delete(':eventId/materials/:materialId')
  @UseGuards(AccessTokenGuard)
  async removeMaterial(
    @Param('eventId') eventId: string,
    @Param('materialId') materialId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.eventsService.removeMaterial(eventId, materialId, currentUser);
  }
}
