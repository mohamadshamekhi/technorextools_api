import { Injectable } from '@nestjs/common';
import type { Prisma, Warranty } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const verifyInclude = {
  orderItem: { select: { id: true, productTitle: true, sku: true } },
} satisfies Prisma.WarrantyInclude;

export type WarrantyVerifyRow = Prisma.WarrantyGetPayload<{ include: typeof verifyInclude }>;

/** All Prisma access for the `warranties` collection. */
@Injectable()
export class WarrantyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Warranty | null> {
    return this.prisma.warranty.findUnique({ where: { id } });
  }

  findBySerialNumber(serialNumber: string): Promise<WarrantyVerifyRow | null> {
    return this.prisma.warranty.findFirst({ where: { serialNumber }, include: verifyInclude });
  }

  listByOrder(orderId: string): Promise<WarrantyVerifyRow[]> {
    return this.prisma.warranty.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      include: verifyInclude,
    });
  }

  create(data: {
    orderId: string;
    orderItemId: string;
    serialNumber: string | null;
    startsAt: Date;
    endsAt: Date;
  }): Promise<Warranty> {
    return this.prisma.warranty.create({ data });
  }
}
