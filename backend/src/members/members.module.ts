import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [MembersController],
  providers: [MembersService, AccessTokenGuard],
  exports: [MembersService],
})
export class MembersModule {}
