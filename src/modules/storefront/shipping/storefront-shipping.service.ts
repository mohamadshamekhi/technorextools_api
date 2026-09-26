import { Injectable } from '@nestjs/common';
import type { ShippingCostType } from '@prisma/client';
import { ShippingMethodRepository } from '../../shipping/repositories/shipping-method.repository';

export interface StorefrontShippingMethodView {
  id: string;
  title: string;
  costType: ShippingCostType;
  cost: number;
  freeOverAmount: number | null;
  sortOrder: number;
}

@Injectable()
export class StorefrontShippingService {
  constructor(private readonly methods: ShippingMethodRepository) {}

  async listMethods(): Promise<StorefrontShippingMethodView[]> {
    const rows = await this.methods.findMany({ isActive: true });
    return rows.map((m) => ({
      id: m.id,
      title: m.title,
      costType: m.costType,
      cost: m.cost,
      freeOverAmount: m.freeOverAmount,
      sortOrder: m.sortOrder,
    }));
  }
}
