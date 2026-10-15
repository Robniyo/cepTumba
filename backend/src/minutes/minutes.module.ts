import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MinutesController } from './minutes.controller';
import { MinutesService } from './minutes.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule, NotificationsModule],
  controllers: [MinutesController],
  providers: [MinutesService, AccessTokenGuard],
  exports: [MinutesService],
})
export class MinutesModule {}
