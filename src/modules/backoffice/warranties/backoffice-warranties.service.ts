import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RepairStatus } from '@prisma/client';
import { OrderRepository } from '../../orders/repositories/order.repository';
import {
  RepairRequestRepository,
  type RepairRequestRow,
} from '../../warranty/repositories/repair-request.repository';
import { WarrantyRepository } from '../../warranty/repositories/warranty.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import { toAttachmentViews, type RepairAttachmentView } from '../../warranty/repair.view';

function toRepairView(r: RepairRequestRow, attachments: RepairAttachmentView[] = []) {
  return {
    id: r.id,
    issueDescription: r.issueDescription,
    status: r.status,
    user: { name: r.user.fullName, mobile: r.user.mobile },
    warranty: r.warranty
      ? { serialNumber: r.warranty.serialNumber, orderId: r.warranty.orderId }
      : null,
    attachments,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class BackofficeWarrantiesService {
  constructor(
    private readonly warranties: WarrantyRepository,
    private readonly repairs: RepairRequestRepository,
    private readonly orders: OrderRepository,
    private readonly media: MediaRepository,
  ) {}

  listForOrder(orderId: string) {
    return this.warranties.listByOrder(orderId);
  }

  async issue(input: {
    orderId: string;
    orderItemId: string;
    serialNumber: string | null;
    startsAt: Date;
    endsAt: Date;
  }) {
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException('تاریخ پایان باید بعد از تاریخ شروع باشد');
    }
    const order = await this.orders.findById(input.orderId);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    const item = order.items.find((i) => i.id === input.orderItemId);
    if (!item) throw new BadRequestException('این قلم متعلق به سفارش نیست');
    return this.warranties.create(input);
  }

  async listRepairs(query: { skip: number; take: number; status?: RepairStatus }) {
    const [rows, total] = await this.repairs.paginate(
      query.status ? { status: query.status } : {},
      query.skip,
      query.take,
    );
    const media = await this.media.findByOwners(
      'REPAIR_REQUEST',
      rows.map((r) => r.id),
    );
    const items = rows.map((r) =>
      toRepairView(r, toAttachmentViews(media.filter((m) => m.ownerId === r.id))),
    );
    return { items, total, skip: query.skip, take: query.take };
  }

  async setRepairStatus(id: string, status: RepairStatus) {
    const existing = await this.repairs.findById(id);
    if (!existing) throw new NotFoundException('درخواست تعمیر یافت نشد');
    const updated = await this.repairs.setStatus(id, status);
    return toRepairView(
      updated,
      toAttachmentViews(await this.media.findByOwner('REPAIR_REQUEST', id)),
    );
  }
}
