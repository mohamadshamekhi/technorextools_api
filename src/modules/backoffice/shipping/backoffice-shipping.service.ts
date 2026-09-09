import { Injectable, NotFoundException } from '@nestjs/common';
import type { ShippingCostType } from '@prisma/client';
import { ShippingMethodRepository } from '../../shipping/repositories/shipping-method.repository';

export interface ShippingMethodInput {
  title?: string;
  costType?: ShippingCostType;
  cost?: number;
  freeOverAmount?: number | null;
  isActive?: boolean;
  sortOrder?: number;
}

@Injectable()
export class BackofficeShippingService {
  constructor(private readonly methods: ShippingMethodRepository) {}

  list() {
    return this.methods.findMany();
  }

  create(input: ShippingMethodInput & { title: string; cost: number }) {
    return this.methods.create(input);
  }

  async update(id: string, input: ShippingMethodInput) {
    const existing = await this.methods.findById(id);
    if (!existing) throw new NotFoundException('روش ارسال یافت نشد');
    return this.methods.update(id, input);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.methods.findById(id);
    if (!existing) throw new NotFoundException('روش ارسال یافت نشد');
    await this.methods.delete(id);
  }
}
