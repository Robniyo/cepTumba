import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule],
  controllers: [FamiliesController],
  providers: [FamiliesService, AccessTokenGuard],
  exports: [FamiliesService],
})
export class FamiliesModule {}
