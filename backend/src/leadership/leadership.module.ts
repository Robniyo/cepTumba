import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LeadershipController } from './leadership.controller';
import { LeadershipService } from './leadership.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [LeadershipController],
  providers: [LeadershipService, AccessTokenGuard],
  exports: [LeadershipService],
})
export class LeadershipModule {}
