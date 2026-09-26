import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentMethodKind } from '@prisma/client';
import { PaymentMethodRepository } from '../../payment-methods/repositories/payment-method.repository';

export interface PaymentMethodInput {
  title?: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * Metadata (title/description/isActive/sortOrder) for `payment_methods`. `code`
 * (`online`/`cash`) is `@unique` and immutable once created — create/delete only
 * toggle whether a code currently has a row; they can't add a code the checkout
 * flow doesn't already handle (see the model's doc comment in `schema.prisma`).
 */
@Injectable()
export class BackofficePaymentMethodsService {
  constructor(private readonly methods: PaymentMethodRepository) {}

  list() {
    return this.methods.findMany();
  }

  async detail(id: string) {
    const method = await this.methods.findById(id);
    if (!method) throw new NotFoundException('روش پرداخت یافت نشد');
    return method;
  }

  async create(input: PaymentMethodInput & { code: PaymentMethodKind; title: string }) {
    const existing = await this.methods.findByCode(input.code);
    if (existing) throw new ConflictException('روشی با این کد از قبل وجود دارد');
    return this.methods.create(input);
  }

  async update(id: string, input: PaymentMethodInput) {
    const existing = await this.methods.findById(id);
    if (!existing) throw new NotFoundException('روش پرداخت یافت نشد');
    return this.methods.update(id, input);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.methods.findById(id);
    if (!existing) throw new NotFoundException('روش پرداخت یافت نشد');
    await this.methods.delete(id);
  }
}
