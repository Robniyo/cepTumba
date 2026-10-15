import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingController } from './messaging.controller';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule, NotificationsModule],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway, AccessTokenGuard],
  exports: [MessagingService],
})
export class MessagingModule {}
