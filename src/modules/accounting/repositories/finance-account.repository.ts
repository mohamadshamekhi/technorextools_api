import { Injectable } from '@nestjs/common';
import type { FinanceAccount, PaymentMethodKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `finance_accounts` collection (cashbox / bank / gateway). */
@Injectable()
export class FinanceAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<FinanceAccount | null> {
    return this.prisma.financeAccount.findUnique({ where: { id } });
  }

  findMany(where: Prisma.FinanceAccountWhereInput = {}): Promise<FinanceAccount[]> {
    return this.prisma.financeAccount.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findBySalesPaymentMethod(code: PaymentMethodKind): Promise<FinanceAccount | null> {
    return this.prisma.financeAccount.findFirst({
      where: { salesPaymentMethod: code },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.FinanceAccountCreateInput): Promise<FinanceAccount> {
    return this.prisma.financeAccount.create({ data });
  }

  update(id: string, data: Prisma.FinanceAccountUpdateInput): Promise<FinanceAccount> {
    return this.prisma.financeAccount.update({ where: { id }, data });
  }

  /** Unmap `code` from every account except `keepId` — one sales account per payment method. */
  async clearSalesPaymentMethod(code: PaymentMethodKind, keepId: string): Promise<void> {
    await this.prisma.financeAccount.updateMany({
      where: { salesPaymentMethod: code, id: { not: keepId } },
      data: { salesPaymentMethod: null },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.financeAccount.delete({ where: { id } });
  }
}
