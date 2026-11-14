import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  createAccountSchema,
  createCategorySchema,
  createTransactionSchema,
  listCategoriesQuerySchema,
  listTransactionsQuerySchema,
  profitLossQuerySchema,
  updateAccountSchema,
  updateCategorySchema,
  updateTransactionSchema,
  type CreateAccountInput,
  type CreateCategoryInput,
  type CreateTransactionInput,
  type ListCategoriesQuery,
  type ListTransactionsQuery,
  type ProfitLossQuery,
  type UpdateAccountInput,
  type UpdateCategoryInput,
  type UpdateTransactionInput,
} from './accounting.schemas';
import { BackofficeAccountingService } from './backoffice-accounting.service';

function sendCsv(res: Response, filename: string, body: string): string {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return body;
}

const stamp = (): string => new Date().toISOString().slice(0, 10);

/**
 * Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/accounting`.
 * Mid-level single-entry bookkeeping: accounts (cashbox/bank/gateway) with balances,
 * income/expense categories, manual entries + transfers, automatic order postings, a
 * profit & loss report and CSV exports.
 */
@Controller('backoffice/accounting')
export class BackofficeAccountingController {
  constructor(private readonly accounting: BackofficeAccountingService) {}

  // accounts
  @RequirePermissions('accounting.view')
  @Get('accounts')
  listAccounts() {
    return this.accounting.listAccounts();
  }

  @RequirePermissions('accounting.manage')
  @Post('accounts')
  createAccount(@Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountInput) {
    return this.accounting.createAccount(body);
  }

  @RequirePermissions('accounting.manage')
  @Patch('accounts/:id')
  updateAccount(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountInput,
  ) {
    return this.accounting.updateAccount(id, body);
  }

  @RequirePermissions('accounting.manage')
  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAccount(@Param('id') id: string): Promise<void> {
    await this.accounting.removeAccount(id);
  }

  // categories
  @RequirePermissions('accounting.view')
  @Get('categories')
  listCategories(
    @Query(new ZodValidationPipe(listCategoriesQuerySchema)) query: ListCategoriesQuery,
  ) {
    return this.accounting.listCategories(query);
  }

  @RequirePermissions('accounting.manage')
  @Post('categories')
  createCategory(@Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput) {
    return this.accounting.createCategory(body);
  }

  @RequirePermissions('accounting.manage')
  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
  ) {
    return this.accounting.updateCategory(id, body);
  }

  @RequirePermissions('accounting.manage')
  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCategory(@Param('id') id: string): Promise<void> {
    await this.accounting.removeCategory(id);
  }

  // transactions
  @RequirePermissions('accounting.view')
  @Get('transactions')
  listTransactions(
    @Query(new ZodValidationPipe(listTransactionsQuerySchema)) query: ListTransactionsQuery,
  ) {
    return this.accounting.listTransactions(query);
  }

  @RequirePermissions('accounting.view')
  @Get('transactions/export')
  async exportTransactions(
    @Query(new ZodValidationPipe(listTransactionsQuerySchema)) query: ListTransactionsQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.accounting.exportTransactionsCsv(query);
    return sendCsv(res, `transactions-${stamp()}.csv`, csv);
  }

  @RequirePermissions('accounting.view')
  @Get('transactions/:id')
  getTransaction(@Param('id') id: string) {
    return this.accounting.getTransaction(id);
  }

  @RequirePermissions('accounting.manage')
  @Post('transactions')
  createTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTransactionSchema)) body: CreateTransactionInput,
  ) {
    return this.accounting.createTransaction(body, user.id);
  }

  @RequirePermissions('accounting.manage')
  @Patch('transactions/:id')
  updateTransaction(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTransactionSchema)) body: UpdateTransactionInput,
  ) {
    return this.accounting.updateTransaction(id, body);
  }

  @RequirePermissions('accounting.manage')
  @Delete('transactions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTransaction(@Param('id') id: string): Promise<void> {
    await this.accounting.removeTransaction(id);
  }

  @RequirePermissions('accounting.manage')
  @Post('sync-orders')
  @HttpCode(HttpStatus.OK)
  syncOrders() {
    return this.accounting.syncOrders();
  }

  // reports
  @RequirePermissions('accounting.view')
  @Get('reports/profit-loss')
  profitLoss(@Query(new ZodValidationPipe(profitLossQuerySchema)) query: ProfitLossQuery) {
    return this.accounting.profitLoss(query);
  }

  @RequirePermissions('accounting.view')
  @Get('reports/profit-loss/export')
  async exportProfitLoss(
    @Query(new ZodValidationPipe(profitLossQuerySchema)) query: ProfitLossQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.accounting.exportProfitLossCsv(query);
    return sendCsv(res, `profit-loss-${stamp()}.csv`, csv);
  }
}
