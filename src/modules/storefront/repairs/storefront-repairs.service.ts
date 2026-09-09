import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RepairRequestRepository, type RepairRequestRow } from '../../warranty/repositories/repair-request.repository';
import { WarrantyRepository } from '../../warranty/repositories/warranty.repository';

function toView(r: RepairRequestRow) {
  return {
    id: r.id,
    issueDescription: r.issueDescription,
    status: r.status,
    warrantySerial: r.warranty?.serialNumber ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

@Injectable()
export class StorefrontRepairsService {
  constructor(
    private readonly repairs: RepairRequestRepository,
    private readonly warranties: WarrantyRepository,
  ) {}

  async list(userId: string, skip: number, take: number) {
    const [rows, total] = await this.repairs.listByUser(userId, skip, take);
    return { items: rows.map(toView), total, skip, take };
  }

  async detail(userId: string, id: string) {
    const row = await this.repairs.findById(id);
    if (!row) throw new NotFoundException('درخواست تعمیر یافت نشد');
    if (row.userId !== userId) throw new ForbiddenException('این درخواست متعلق به شما نیست');
    return toView(row);
  }

  async create(userId: string, issueDescription: string, warrantySerial?: string) {
    let warrantyId: string | null = null;
    if (warrantySerial) {
      const warranty = await this.warranties.findBySerialNumber(warrantySerial);
      if (!warranty) throw new NotFoundException('گارانتی با این شماره سریال یافت نشد');
      warrantyId = warranty.id;
    }
    const created = await this.repairs.create({ userId, warrantyId, issueDescription });
    return toView(created);
  }
}
