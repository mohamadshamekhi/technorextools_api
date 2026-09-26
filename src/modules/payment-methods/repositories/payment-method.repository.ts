import { Injectable } from '@nestjs/common';
import type { PaymentMethod, PaymentMethodKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * All Prisma access for the `payment_methods` collection — admin-editable metadata
 * for each `PaymentMethodKind`. `code` is `@unique` (see `schema.prisma`): at most one
 * row per enum value, so create/delete only toggle *whether* a code has a row at all —
 * they can't introduce a code checkout doesn't already know how to handle.
 */
@Injectable()
export class PaymentMethodRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<PaymentMethod | null> {
    return this.prisma.paymentMethod.findUnique({ where: { id } });
  }

  findByCode(code: PaymentMethodKind): Promise<PaymentMethod | null> {
    return this.prisma.paymentMethod.findUnique({ where: { code } });
  }

  findMany(where: Prisma.PaymentMethodWhereInput = {}): Promise<PaymentMethod[]> {
    return this.prisma.paymentMethod.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(data: Prisma.PaymentMethodCreateInput): Promise<PaymentMethod> {
    return this.prisma.paymentMethod.create({ data });
  }

  update(id: string, data: Prisma.PaymentMethodUpdateInput): Promise<PaymentMethod> {
    return this.prisma.paymentMethod.update({ where: { id }, data });
  }

  delete(id: string): Promise<PaymentMethod> {
    return this.prisma.paymentMethod.delete({ where: { id } });
  }
}
