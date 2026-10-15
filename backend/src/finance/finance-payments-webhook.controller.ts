import { Body, Controller, Post } from '@nestjs/common';
import { FinancePaymentsService } from './finance-payments.service';

@Controller('finance/mobile-money')
export class FinancePaymentsWebhookController {
  constructor(private readonly financePaymentsService: FinancePaymentsService) {}

  @Post('callback')
  async callback(
    @Body() payload: Record<string, unknown>,
  ) {
    return this.financePaymentsService.handleCallback(payload);
  }
}
