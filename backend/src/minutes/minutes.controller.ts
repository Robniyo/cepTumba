import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { extname } from 'path';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { MinutesService } from './minutes.service';
import { CreateMinuteDto } from './dto/create-minute.dto';
import { UpdateMinuteDto } from './dto/update-minute.dto';
import { AgendaItemDto } from './dto/agenda-item.dto';
import { CreateResolutionDto, UpdateResolutionDto } from './dto/resolution.dto';
import { CreateActionItemDto } from './dto/action-item.dto';
import { AddDocumentVersionDto, CreateDocumentDto } from './dto/document.dto';

const ALLOWED_DOC_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);
const ALLOWED_DOC_EXT = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
]);
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15 MB

@UseGuards(AccessTokenGuard)
@Controller()
export class MinutesController {
  constructor(private readonly minutesService: MinutesService) {}

  // Minutes
  @Get('minutes')
  async listMinutes(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.minutesService.listMinutes(currentUser);
    return { items };
  }

  @Post('minutes')
  async createMinute(
    @Body() dto: CreateMinuteDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.createMinute(dto, currentUser);
    return { minute };
  }

  @Patch('minutes/:id')
  async updateMinute(
    @Param('id') id: string,
    @Body() dto: UpdateMinuteDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.updateMinute(id, dto, currentUser);
    return { minute };
  }

  @Delete('minutes/:id')
  async deleteMinute(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.minutesService.deleteMinute(id, currentUser);
  }

  @Post('minutes/:id/agenda')
  async addAgenda(
    @Param('id') id: string,
    @Body() dto: AgendaItemDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.addAgendaItem(id, dto, currentUser);
    return { minute };
  }

  @Delete('minutes/:id/agenda/:itemId')
  async removeAgenda(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.removeAgendaItem(id, itemId, currentUser);
    return { minute };
  }

  @Post('minutes/:id/resolutions')
  async addResolution(
    @Param('id') id: string,
    @Body() dto: CreateResolutionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.addResolution(id, dto, currentUser);
    return { minute };
  }

  @Patch('minutes/:id/resolutions/:resolutionId')
  async updateResolution(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @Body() dto: UpdateResolutionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.updateResolution(id, resolutionId, dto, currentUser);
    return { minute };
  }

  @Delete('minutes/:id/resolutions/:resolutionId')
  async removeResolution(
    @Param('id') id: string,
    @Param('resolutionId') resolutionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.removeResolution(id, resolutionId, currentUser);
    return { minute };
  }

  @Post('minutes/:id/actions')
  async addAction(
    @Param('id') id: string,
    @Body() dto: CreateActionItemDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.addAction(id, dto, currentUser);
    return { minute };
  }

  @Patch('minutes/:id/actions/:actionId/toggle')
  async toggleAction(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.toggleAction(id, actionId, currentUser);
    return { minute };
  }

  @Delete('minutes/:id/actions/:actionId')
  async removeAction(
    @Param('id') id: string,
    @Param('actionId') actionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const minute = await this.minutesService.removeAction(id, actionId, currentUser);
    return { minute };
  }

  // Documents
  @Post('documents/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_DOCUMENT_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_DOC_MIME.has(file.mimetype) || !ALLOWED_DOC_EXT.has(ext)) {
          return cb(
            new BadRequestException(
              'Only PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, and CSV files up to 15MB are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('File exceeds 15MB limit');
    }

    const stored = await this.minutesService.storeDocumentFile({
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
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
      },
    };
  }

  @Get('documents')
  async listDocuments() {
    const items = await this.minutesService.listDocuments();
    return { items };
  }

  @Post('documents')
  async createDocument(
    @Body() dto: CreateDocumentDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const document = await this.minutesService.createDocument(dto, currentUser);
    return { document };
  }

  @Post('documents/:id/versions')
  async addVersion(
    @Param('id') id: string,
    @Body() dto: AddDocumentVersionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const document = await this.minutesService.addDocumentVersion(id, dto, currentUser);
    return { document };
  }

  @Delete('documents/:id')
  async removeDocument(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.minutesService.removeDocument(id, currentUser);
  }

  @Delete('documents/:id/versions/:versionId')
  async removeVersion(
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const document = await this.minutesService.removeDocumentVersion(id, versionId, currentUser);
    return { document };
  }
}
