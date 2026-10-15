import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WelfareController } from './welfare.controller';
import { WelfareService } from './welfare.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule, NotificationsModule],
  controllers: [WelfareController],
  providers: [WelfareService, AccessTokenGuard],
  exports: [WelfareService],
})
export class WelfareModule {}
