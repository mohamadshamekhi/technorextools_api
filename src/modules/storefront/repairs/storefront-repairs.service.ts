import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  RepairRequestRepository,
  type RepairRequestRow,
} from '../../warranty/repositories/repair-request.repository';
import { WarrantyRepository } from '../../warranty/repositories/warranty.repository';
import { MediaService } from '../../media/media.service';
import { MediaRepository } from '../../media/repositories/media.repository';
import { toAttachmentViews, type RepairAttachmentView } from '../../warranty/repair.view';

function toView(r: RepairRequestRow, attachments: RepairAttachmentView[] = []) {
  return {
    id: r.id,
    issueDescription: r.issueDescription,
    status: r.status,
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
