import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { LoggingModule } from '../logging/logging.module';
import { FinanceController } from './finance.controller';
import { FinancePaymentsWebhookController } from './finance-payments-webhook.controller';
import { FinancePaymentsService } from './finance-payments.service';
import { FinanceService } from './finance.service';

@Module({
  imports: [JwtModule.register({}), LoggingModule],
  controllers: [FinanceController, FinancePaymentsWebhookController],
  providers: [FinanceService, FinancePaymentsService, AccessTokenGuard],
  exports: [FinanceService, FinancePaymentsService],
})
export class FinanceModule {}
