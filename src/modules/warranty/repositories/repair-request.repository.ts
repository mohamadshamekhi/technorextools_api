import { Injectable } from '@nestjs/common';
import { Prisma, type RepairEventActor, type RepairStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const withRefs = {
  warranty: { select: { serialNumber: true, orderId: true } },
  user: { select: { fullName: true, mobile: true } },
} satisfies Prisma.RepairRequestInclude;

export type RepairRequestRow = Prisma.RepairRequestGetPayload<{ include: typeof withRefs }>;

function event(
  status: RepairStatus,
  note: string | null | undefined,
  by: RepairEventActor,
): Prisma.RepairStatusEventCreateInput {
  return { status, at: new Date(), note: note ?? null, by };
}

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

  /**
   * Status change + its timeline entry in one write — the history is append-only,
   * so `push` keeps it consistent even if two admins act at once.
   */
  setStatus(id: string, status: RepairStatus, note?: string | null): Promise<RepairRequestRow> {
    return this.prisma.repairRequest.update({
      where: { id },
      data: {
        status,
        statusHistory: { push: event(status, note, 'admin') },
      },
      include: withRefs,
    });
  }

  /**
   * Owner-scoped compare-and-set — the customer's approve/reject of a quote.
   * Returns `null` when the row isn't theirs or has already left `from`, so two
   * taps can't append two entries.
   */
  async transitionByOwner(
    id: string,
    userId: string,
    from: RepairStatus[],
    to: RepairStatus,
    note?: string | null,
  ): Promise<RepairRequestRow | null> {
    const { count } = await this.prisma.repairRequest.updateMany({
      where: { id, userId, status: { in: from } },
      data: { status: to, statusHistory: { push: event(to, note, 'customer') } },
    });
    if (count === 0) return null;
    return this.findById(id);
  }

  /** Technician metadata — never touches `status` or the timeline. */
  update(
    id: string,
    data: { technicianNote?: string | null; estimatedCost?: number | null },
  ): Promise<RepairRequestRow> {
    return this.prisma.repairRequest.update({ where: { id }, data, include: withRefs });
  }
}
