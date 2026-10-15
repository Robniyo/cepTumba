import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { parseExportFormat } from '../common/export-utils';
import { FinanceService } from './finance.service';
import { FinancePaymentsService } from './finance-payments.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionStatusDto } from './dto/update-transaction-status.dto';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { InitiateSavingsMobileMoneyDto } from './dto/initiate-savings-mobile-money.dto';

@UseGuards(AccessTokenGuard)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly financePaymentsService: FinancePaymentsService,
  ) {}

  @Get('transactions')
  async listTransactions(
    @Query() query: ListTransactionsDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.financeService.listTransactions(query, currentUser);
  }

  @Get('transactions/export')
  async exportTransactions(
    @Query() query: ListTransactionsDto,
    @Query('format') format: string | undefined,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');

    const parsedFormat = parseExportFormat(format);
    const { buffer, contentType, fileName } = await this.financeService.exportTransactions(
      parsedFormat,
      query,
      currentUser,
    );

    response.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });

    return new StreamableFile(buffer);
  }

  @Post('transactions')
  async createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const transaction = await this.financeService.createTransaction(dto, currentUser);
    return { transaction };
  }

  @Patch('transactions/:transactionId/status')
  async updateStatus(
    @Param('transactionId') transactionId: string,
    @Body() dto: UpdateTransactionStatusDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const transaction = await this.financeService.updateTransactionStatus(
      transactionId,
      dto,
      currentUser,
    );
    return { transaction };
  }

  @Delete('transactions/:transactionId')
  async deleteTransaction(
    @Param('transactionId') transactionId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.financeService.deleteTransaction(transactionId, currentUser);
  }

  @Get('budgets')
  async listBudgets(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const items = await this.financeService.listBudgets(currentUser);
    return { items };
  }

  @Post('budgets')
  async createBudget(
    @Body() dto: CreateBudgetDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const budget = await this.financeService.createBudget(dto, currentUser);
    return { budget };
  }

  @Patch('budgets/:budgetId')
  async updateBudget(
    @Param('budgetId') budgetId: string,
    @Body() dto: UpdateBudgetDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    const budget = await this.financeService.updateBudget(budgetId, dto, currentUser);
    return { budget };
  }

  @Delete('budgets/:budgetId')
  async deleteBudget(
    @Param('budgetId') budgetId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.financeService.deleteBudget(budgetId, currentUser);
  }

  @Get('savings/me')
  async mySavings(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.financeService.getMySavings(currentUser);
  }

  @Get('savings/:memberId')
  async memberSavings(
    @Param('memberId') memberId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.financeService.getMemberSavings(memberId, currentUser);
  }

  @Get('summary')
  async summary(@CurrentUser() currentUser: AuthTokenPayload | undefined) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');
    return this.financeService.getSummary(currentUser);
  }

  @Post('savings/mobile-money/initiate')
  async initiateSavingsMobileMoney(
    @Body() dto: InitiateSavingsMobileMoneyDto,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');

    const payment =
      await this.financePaymentsService.initiateSavingsMobileMoneyPayment(dto, {
        sub: currentUser.sub,
        role: currentUser.role,
      });

    return { payment };
  }

  @Get('savings/mobile-money/:paymentId')
  async getSavingsMobileMoneyPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() currentUser: AuthTokenPayload | undefined,
  ) {
    if (!currentUser) throw new UnauthorizedException('Missing current user');

    const payment = await this.financePaymentsService.getSavingsMobileMoneyPayment(
      paymentId,
      {
        sub: currentUser.sub,
        role: currentUser.role,
      },
    );

    return { payment };
  }
}
