import { Injectable } from '@nestjs/common';
import type { PaymentMethodKind } from '@prisma/client';
import { PaymentMethodRepository } from '../../payment-methods/repositories/payment-method.repository';

export interface StorefrontPaymentMethodView {
  id: string;
  code: PaymentMethodKind;
  title: string;
  description: string | null;
  sortOrder: number;
}

@Injectable()
export class StorefrontPaymentMethodsService {
  constructor(private readonly methods: PaymentMethodRepository) {}

  async listMethods(): Promise<StorefrontPaymentMethodView[]> {
    const rows = await this.methods.findMany({ isActive: true });
    return rows.map((m) => ({
      id: m.id,
      code: m.code,
      title: m.title,
      description: m.description,
      sortOrder: m.sortOrder,
    }));
  }
}
