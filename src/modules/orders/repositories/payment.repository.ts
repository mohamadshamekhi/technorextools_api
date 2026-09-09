import { Injectable } from '@nestjs/common';
import { PaymentStatus, type Payment, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `payments` collection. */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    orderId: string;
    gateway: string;
    authority: string;
    amount: number;
  }): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        gateway: data.gateway,
        refId: data.authority,
        amount: data.amount,
        status: PaymentStatus.pending,
      },
    });
  }

  findLatestPendingForOrder(orderId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.pending },
      orderBy: { createdAt: 'desc' },
    });
  }

  markSuccess(id: string, refId: string): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.success, refId, paidAt: new Date() },
    });
  }

  markFailed(id: string): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: { status: PaymentStatus.failed },
    });
  }

  paginate(
    where: Prisma.PaymentWhereInput,
    skip: number,
    take: number,
  ): Promise<[Payment[], number]> {
    return Promise.all([
      this.prisma.payment.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.payment.count({ where }),
    ]);
  }
}
