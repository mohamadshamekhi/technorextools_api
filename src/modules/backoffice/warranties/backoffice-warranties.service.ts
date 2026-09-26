import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, type RepairStatus } from '@prisma/client';
import { OrderRepository } from '../../orders/repositories/order.repository';
import {
  RepairRequestRepository,
  type RepairRequestRow,
} from '../../warranty/repositories/repair-request.repository';
import { WarrantyRepository } from '../../warranty/repositories/warranty.repository';
import { MediaRepository } from '../../media/repositories/media.repository';
import { NotificationRepository } from '../../notifications/repositories/notification.repository';
import {
  repairStatusLabel,
  toAttachmentViews,
  toStatusHistoryView,
  type RepairAttachmentView,
} from '../../warranty/repair.view';

function toRepairView(r: RepairRequestRow, attachments: RepairAttachmentView[] = []) {
  return {
    id: r.id,
    issueDescription: r.issueDescription,
    status: r.status,
    statusLabel: repairStatusLabel(r.status),
    statusHistory: toStatusHistoryView(r),
    technicianNote: r.technicianNote,
    estimatedCost: r.estimatedCost,
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
  private readonly logger = new Logger('Repairs');

  constructor(
    private readonly warranties: WarrantyRepository,
    private readonly repairs: RepairRequestRepository,
    private readonly orders: OrderRepository,
    private readonly media: MediaRepository,
    private readonly notifications: NotificationRepository,
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

  async setRepairStatus(id: string, status: RepairStatus, note?: string | null) {
    const existing = await this.repairs.findById(id);
    if (!existing) throw new NotFoundException('درخواست تعمیر یافت نشد');
    // Re-sending the same status is a no-op: no timeline entry, no notification.
    const updated =
      existing.status === status && !note
        ? existing
        : await this.repairs.setStatus(id, status, note);
    if (existing.status !== status) {
      await this.notifyStatusChange(updated.userId, id, status);
    }
    return toRepairView(
      updated,
      toAttachmentViews(await this.media.findByOwner('REPAIR_REQUEST', id)),
    );
  }

  /** Technician findings — separate from the status flow, no notification. */
  async updateRepair(
    id: string,
    input: { technicianNote?: string | null; estimatedCost?: number | null },
  ) {
    const existing = await this.repairs.findById(id);
    if (!existing) throw new NotFoundException('درخواست تعمیر یافت نشد');
    const updated = await this.repairs.update(id, input);
    return toRepairView(
      updated,
      toAttachmentViews(await this.media.findByOwner('REPAIR_REQUEST', id)),
    );
  }

  /** Best-effort in-app notification — a failure here must not fail the transition. */
  private async notifyStatusChange(
    userId: string,
    repairId: string,
    status: RepairStatus,
  ): Promise<void> {
    try {
      await this.notifications.create({
        userId,
        type: NotificationType.repair_status,
        title: 'وضعیت درخواست تعمیر',
        body: `درخواست تعمیر شما ${repairStatusLabel(status)} است.`,
        link: `/dashboard/repairs/${repairId}`,
      });
    } catch (err) {
      this.logger.warn(`repair notify failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
