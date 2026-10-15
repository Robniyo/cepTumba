import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DevotionController } from './devotion.controller';
import { DevotionService } from './devotion.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule, NotificationsModule],
  controllers: [DevotionController],
  providers: [DevotionService, AccessTokenGuard],
  exports: [DevotionService],
})
export class DevotionModule {}
