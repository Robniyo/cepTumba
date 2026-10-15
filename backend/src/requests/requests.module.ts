import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule, NotificationsModule],
  controllers: [RequestsController],
  providers: [RequestsService, AccessTokenGuard],
  exports: [RequestsService],
})
export class RequestsModule {}
