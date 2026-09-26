import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { RepairStatus } from '@prisma/client';
import {
  RepairRequestRepository,
  type RepairRequestRow,
} from '../../warranty/repositories/repair-request.repository';
import { WarrantyRepository } from '../../warranty/repositories/warranty.repository';
import { MediaService } from '../../media/media.service';
import { MediaRepository } from '../../media/repositories/media.repository';
import {
  repairStatusLabel,
  toAttachmentViews,
  toStatusHistoryView,
  type RepairAttachmentView,
} from '../../warranty/repair.view';

function toView(r: RepairRequestRow, attachments: RepairAttachmentView[] = []) {
  return {
    id: r.id,
    issueDescription: r.issueDescription,
    status: r.status,
    statusLabel: repairStatusLabel(r.status),
    statusHistory: toStatusHistoryView(r),
    technicianNote: r.technicianNote,
    estimatedCost: r.estimatedCost,
    warrantySerial: r.warranty?.serialNumber ?? null,
    attachments,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class StorefrontRepairsService {
  constructor(
    private readonly repairs: RepairRequestRepository,
    private readonly warranties: WarrantyRepository,
    private readonly media: MediaService,
    private readonly mediaRows: MediaRepository,
  ) {}

  async list(userId: string, skip: number, take: number) {
    const [rows, total] = await this.repairs.listByUser(userId, skip, take);
    const media = await this.mediaRows.findByOwners(
      'REPAIR_REQUEST',
      rows.map((r) => r.id),
    );
    return {
      items: rows.map((r) => toView(r, toAttachmentViews(media.filter((m) => m.ownerId === r.id)))),
      total,
      skip,
      take,
    };
  }

  async detail(userId: string, id: string) {
    const row = await this.repairs.findById(id);
    if (!row) throw new NotFoundException('درخواست تعمیر یافت نشد');
    if (row.userId !== userId) throw new ForbiddenException('این درخواست متعلق به شما نیست');
    return toView(row, await this.attachments(row.id));
  }

  /**
   * Customer's answer to a quote (`estimatedCost` while `awaiting_customer`).
   * Approve moves it into repair; reject cancels it. The transition is an
   * owner-scoped compare-and-set, so a double tap appends one timeline entry.
   */
  async decide(userId: string, id: string, decision: 'approve' | 'reject', note?: string | null) {
    const row = await this.repairs.findById(id);
    // 404 (not 403) for someone else's row — its existence isn't leaked.
    if (!row || row.userId !== userId) throw new NotFoundException('درخواست تعمیر یافت نشد');
    if (row.status !== 'awaiting_customer') {
      throw new ConflictException('این درخواست در انتظار تأیید شما نیست');
    }
    if (row.estimatedCost === null) {
      throw new ConflictException('هزینه‌ی تخمینی برای این درخواست ثبت نشده است');
    }

    const to: RepairStatus = decision === 'approve' ? 'in_progress' : 'canceled';
    const updated = await this.repairs.transitionByOwner(
      id,
      userId,
      ['awaiting_customer'],
      to,
      note,
    );
    // Lost the race — someone already moved it out of `awaiting_customer`.
    if (!updated) throw new ConflictException('وضعیت این درخواست تغییر کرده است');
    return toView(updated, await this.attachments(id));
  }

  private async attachments(repairId: string): Promise<RepairAttachmentView[]> {
    return toAttachmentViews(await this.mediaRows.findByOwner('REPAIR_REQUEST', repairId));
  }

  async create(
    userId: string,
    issueDescription: string,
    warrantySerial?: string,
    mediaIds: string[] = [],
  ) {
    let warrantyId: string | null = null;
    if (warrantySerial) {
      const warranty = await this.warranties.findBySerialNumber(warrantySerial);
      if (!warranty) throw new NotFoundException('گارانتی با این شماره سریال یافت نشد');
      warrantyId = warranty.id;
    }
    const created = await this.repairs.create({ userId, warrantyId, issueDescription });
    await this.media.attachToOwner(mediaIds, 'REPAIR_REQUEST', created.id, userId);
    return toView(created, await this.attachments(created.id));
  }
}
