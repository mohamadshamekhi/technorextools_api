import { Injectable } from '@nestjs/common';
import { Prisma, type RepairStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const withRefs = {
  warranty: { select: { serialNumber: true, orderId: true } },
  user: { select: { fullName: true, mobile: true } },
} satisfies Prisma.RepairRequestInclude;

export type RepairRequestRow = Prisma.RepairRequestGetPayload<{ include: typeof withRefs }>;

/** All Prisma access for the `repair_requests` collection. */
@Injectable()
export class RepairRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    userId: string;
    warrantyId: string | null;
    issueDescription: string;
  }): Promise<RepairRequestRow> {
    return this.prisma.repairRequest.create({ data, include: withRefs });
  }

  findById(id: string): Promise<RepairRequestRow | null> {
    return this.prisma.repairRequest.findUnique({ where: { id }, include: withRefs });
  }

  listByUser(userId: string, skip: number, take: number) {
    return Promise.all([
      this.prisma.repairRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: withRefs,
      }),
      this.prisma.repairRequest.count({ where: { userId } }),
    ]);
  }

  paginate(where: Prisma.RepairRequestWhereInput, skip: number, take: number) {
    return Promise.all([
      this.prisma.repairRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: withRefs,
      }),
      this.prisma.repairRequest.count({ where }),
    ]);
  }

  setStatus(id: string, status: RepairStatus): Promise<RepairRequestRow> {
    return this.prisma.repairRequest.update({ where: { id }, data: { status }, include: withRefs });
  }
}
