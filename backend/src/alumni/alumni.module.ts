import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AlumniController } from './alumni.controller';
import { AlumniService } from './alumni.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AlumniController],
  providers: [AlumniService, AccessTokenGuard],
  exports: [AlumniService],
})
export class AlumniModule {}
