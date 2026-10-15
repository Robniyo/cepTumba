import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { ListAnnouncementsDto } from './dto/list-announcements.dto';
import { AnnouncementsService } from './announcements.service';
import { UpdateAnnouncementStatusDto } from './dto/update-announcement-status.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get('public')
  async listPublicAnnouncements(@Query('limit') limit?: string) {
    return this.announcementsService.listPublicAnnouncements(limit ? parseInt(limit) : 10);
  }

  @UseGuards(AccessTokenGuard)
  @Get()
  async listAnnouncements(
    @Query() query: ListAnnouncementsDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.announcementsService.listAnnouncements(currentUser, query);
  }

  @UseGuards(AccessTokenGuard)
  @Post()
  async createAnnouncement(
    @Body() dto: CreateAnnouncementDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.announcementsService.createAnnouncement(dto, currentUser);
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':announcementId')
  async updateAnnouncement(
    @Param('announcementId') announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.announcementsService.updateAnnouncement(
      announcementId,
      dto,
      currentUser,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Delete(':announcementId')
  async deleteAnnouncement(
    @Param('announcementId') announcementId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.announcementsService.deleteAnnouncement(
      announcementId,
      currentUser,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':announcementId/status')
  async updateAnnouncementStatus(
    @Param('announcementId') announcementId: string,
    @Body() dto: UpdateAnnouncementStatusDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.announcementsService.updateAnnouncementStatus(
      announcementId,
      dto,
      currentUser.role,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':announcementId/pin')
  async pinAnnouncement(
    @Param('announcementId') announcementId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.announcementsService.setAnnouncementPinned(
      announcementId,
      true,
      currentUser.role,
    );
  }

  @UseGuards(AccessTokenGuard)
  @Patch(':announcementId/unpin')
  async unpinAnnouncement(
    @Param('announcementId') announcementId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    return this.announcementsService.setAnnouncementPinned(
      announcementId,
      false,
      currentUser.role,
    );
  }
}
