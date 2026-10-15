import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule, NotificationsModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AccessTokenGuard],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
