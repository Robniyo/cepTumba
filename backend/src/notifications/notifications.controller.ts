import {
  Body,
  Controller,
  Delete,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { RemovePushSubscriptionDto } from './dto/remove-push-subscription.dto';
import { UpsertPushSubscriptionDto } from './dto/upsert-push-subscription.dto';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(AccessTokenGuard)
  @Post('push-subscriptions')
  async upsertPushSubscription(
    @Body() dto: UpsertPushSubscriptionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ): Promise<{ success: true }> {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    await this.notificationsService.upsertPushSubscription(currentUser.sub, dto);
    return { success: true };
  }

  @UseGuards(AccessTokenGuard)
  @Delete('push-subscriptions')
  async removePushSubscription(
    @Body() dto: RemovePushSubscriptionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ): Promise<{ success: true }> {
    if (!currentUser) {
      throw new UnauthorizedException('Missing current user');
    }

    await this.notificationsService.removePushSubscription(
      currentUser.sub,
      dto.endpoint,
    );

    return { success: true };
  }
}
