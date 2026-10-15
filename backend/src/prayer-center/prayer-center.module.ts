import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrayerCenterController } from './prayer-center.controller';
import { PrayerCenterService } from './prayer-center.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule, NotificationsModule],
  controllers: [PrayerCenterController],
  providers: [PrayerCenterService, AccessTokenGuard],
  exports: [PrayerCenterService],
})
export class PrayerCenterModule {}
