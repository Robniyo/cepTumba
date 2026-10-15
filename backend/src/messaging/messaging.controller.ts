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
import { EditMessageDto } from './dto/edit-message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartDirectChatDto } from './dto/start-direct-chat.dto';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

// Allowed attachment MIME types and extensions
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
  'audio/mpeg',
  'audio/mp3',
]);
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.pdf', '.mp3']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

@UseGuards(AccessTokenGuard)
@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get('conversations')
  async listConversations(@CurrentUser() user: AuthTokenPayload | undefined) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const items = await this.messagingService.listConversations(user.sub);
    return { items };
  }

  @Get('conversations/:id')
  async getConversation(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const conversation = await this.messagingService.getConversationForUser(id, user.sub);
    return { conversation };
  }

  @Get('conversations/:id/messages')
  async listMessages(
    @Param('id') id: string,
    @Query('before') before: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const items = await this.messagingService.listMessages(
      id,
      user.sub,
      before,
      limit ? Number(limit) : 50,
    );
    return { items };
  }

  @Get('conversations/:id/participants')
  async listParticipants(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const items = await this.messagingService.listParticipants(id, user.sub);
    return { items };
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const { message, participantIds } = await this.messagingService.sendMessage(
      id,
      user.sub,
      dto.body ?? '',
      dto.attachment ?? null,
    );
    this.messagingGateway.broadcastNewMessage(participantIds, message);
    return { message };
  }

  @Patch('messages/:id')
  async editMessage(
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const { message, participantIds } = await this.messagingService.editMessage(
      id,
      user.sub,
      dto.body,
    );
    this.messagingGateway.broadcastMessageUpdate(participantIds, message);
    return { message };
  }

  @Delete('messages/:id')
  async deleteMessage(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const { message, participantIds } = await this.messagingService.softDeleteMessage(
      id,
      user.sub,
    );
    this.messagingGateway.broadcastMessageDelete(participantIds, message);
    return { message };
  }

  // -----------------------------
  // Attachment upload (jpg/png/pdf/mp3, max 5MB)
  // -----------------------------
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_BYTES },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
          return cb(
            new BadRequestException(
              'Only JPG, PNG, PDF, and MP3 files up to 5MB are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    if (!file) throw new BadRequestException('File is required');
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('File exceeds 5MB limit');
    }

    const stored = await this.messagingService.storeAttachment({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploaderId: user.sub,
    });

    // Build absolute URL the client can render directly
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const absoluteUrl = `${protocol}://${host}${stored.publicPath}`;

    return {
      attachment: {
        url: absoluteUrl,
        type: file.mimetype,
        name: file.originalname,
        size: file.size,
      },
    };
  }

  @Post('conversations/:id/read')
  async markRead(
    @Param('id') id: string,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const result = await this.messagingService.markAsRead(id, user.sub);
    this.messagingGateway.broadcastReadReceipt(id, user.sub, result.lastReadAt);
    return result;
  }

  @Post('direct')
  async startDirect(
    @Body() dto: StartDirectChatDto,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const result = await this.messagingService.findOrCreateDirectChat(
      user.sub,
      user.role,
      dto.userId,
    );
    const conversation = await this.messagingService.getConversationForUser(
      result.id,
      user.sub,
    );
    return { conversation };
  }

  @Get('users/allowed')
  async allowedUsers(
    @Query('q') q: string | undefined,
    @CurrentUser() user: AuthTokenPayload | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const items = await this.messagingService.listAllowedDirectChatUsers(
      user.sub,
      user.role,
      q,
    );
    return { items };
  }

  @Get('unread-total')
  async unreadTotal(@CurrentUser() user: AuthTokenPayload | undefined) {
    if (!user) throw new UnauthorizedException('Missing current user');
    const total = await this.messagingService.getUnreadTotal(user.sub);
    return { total };
  }

  @Post('system-groups/sync')
  async syncSystemGroups(@CurrentUser() user: AuthTokenPayload | undefined) {
    if (!user) throw new UnauthorizedException('Missing current user');
    if (user.role !== 'president' && user.role !== 'secretary') {
      throw new UnauthorizedException('Only admins can sync system groups');
    }
    await this.messagingService.bootstrapSystemGroups();
    return { ok: true };
  }
}
