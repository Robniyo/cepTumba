import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, AccessTokenGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
