import { Injectable } from '@nestjs/common';
import type { Prisma, ShippingMethod } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `shipping_methods` collection. */
@Injectable()
export class ShippingMethodRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ShippingMethod | null> {
    return this.prisma.shippingMethod.findUnique({ where: { id } });
  }

  findMany(where: Prisma.ShippingMethodWhereInput = {}): Promise<ShippingMethod[]> {
    return this.prisma.shippingMethod.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(data: Prisma.ShippingMethodCreateInput): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.create({ data });
  }

  update(id: string, data: Prisma.ShippingMethodUpdateInput): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.update({ where: { id }, data });
  }

  delete(id: string): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.delete({ where: { id } });
  }
}
