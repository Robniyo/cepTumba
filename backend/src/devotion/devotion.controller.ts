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
import { DevotionService } from './devotion.service';
import { CreateDevotionDto } from './dto/create-devotion.dto';
import { UpdateDevotionDto } from './dto/update-devotion.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { REACTION_KINDS, ReactionKind } from './devotion.types';

@UseGuards(AccessTokenGuard)
@Controller('devotions')
export class DevotionController {
  constructor(private readonly devotionService: DevotionService) {}

  @Get()
  async listDevotions(
    @Query('includeUnpublished') includeUnpublished: string | undefined,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.devotionService.listDevotions(currentUser, {
      includeUnpublished: includeUnpublished === 'true' || includeUnpublished === '1',
    });
    return { items };
  }

  @Get('verse-of-the-day')
  async verseOfTheDay() {
    const devotion = await this.devotionService.getVerseOfTheDay();
    return { devotion };
  }

  @Get(':devotionId')
  async getDevotion(
    @Param('devotionId') devotionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const devotion = await this.devotionService.getDevotion(devotionId, currentUser);
    return { devotion };
  }

  @Post()
  async createDevotion(
    @Body() dto: CreateDevotionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const devotion = await this.devotionService.createDevotion(dto, currentUser);
    return { devotion };
  }

  @Patch(':devotionId')
  async updateDevotion(
    @Param('devotionId') devotionId: string,
    @Body() dto: UpdateDevotionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const devotion = await this.devotionService.updateDevotion(devotionId, dto, currentUser);
    return { devotion };
  }

  @Delete(':devotionId')
  async deleteDevotion(
    @Param('devotionId') devotionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.devotionService.deleteDevotion(devotionId, currentUser);
  }

  @Patch(':devotionId/publish')
  async publish(
    @Param('devotionId') devotionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const devotion = await this.devotionService.publishDevotion(devotionId, currentUser);
    return { devotion };
  }

  @Get(':devotionId/comments')
  async listComments(@Param('devotionId') devotionId: string) {
    const items = await this.devotionService.listComments(devotionId);
    return { items };
  }

  @Post(':devotionId/comments')
  async addComment(
    @Param('devotionId') devotionId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const comment = await this.devotionService.addComment(devotionId, dto, currentUser);
    return { comment };
  }

  @Delete(':devotionId/comments/:commentId')
  async deleteComment(
    @Param('devotionId') devotionId: string,
    @Param('commentId') commentId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.devotionService.deleteComment(devotionId, commentId, currentUser);
  }

  @Post(':devotionId/reactions/:kind')
  async toggleReaction(
    @Param('devotionId') devotionId: string,
    @Param('kind') kind: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    if (!REACTION_KINDS.includes(kind as ReactionKind)) {
      throw new UnauthorizedException('Invalid reaction kind');
    }
    return this.devotionService.toggleReaction(devotionId, kind as ReactionKind, currentUser);
  }
}
