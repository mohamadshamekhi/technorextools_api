import { Injectable } from '@nestjs/common';
import type { AbandonedCartLog } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `abandoned_cart_logs` collection. */
@Injectable()
export class AbandonedCartLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCart(cartId: string): Promise<AbandonedCartLog | null> {
    return this.prisma.abandonedCartLog.findUnique({ where: { cartId } });
  }

  create(cartId: string, channel = 'sms'): Promise<AbandonedCartLog> {
    return this.prisma.abandonedCartLog.create({ data: { cartId, channel } });
  }

  markNotified(id: string): Promise<AbandonedCartLog> {
    return this.prisma.abandonedCartLog.update({
      where: { id },
      data: { notifiedAt: new Date() },
    });
  }

  paginate(skip: number, take: number): Promise<[AbandonedCartLog[], number]> {
    return Promise.all([
      this.prisma.abandonedCartLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.abandonedCartLog.count(),
    ]);
  }
}
