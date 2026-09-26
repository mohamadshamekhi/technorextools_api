import { Injectable, NotFoundException } from '@nestjs/common';
import { WarrantyRepository } from '../../warranty/repositories/warranty.repository';

export interface StorefrontWarrantyView {
  serialNumber: string | null;
  productTitle: string;
  sku: string | null;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

@Injectable()
export class StorefrontWarrantyService {
  constructor(private readonly warranties: WarrantyRepository) {}

  async verify(serial: string): Promise<StorefrontWarrantyView> {
    const warranty = await this.warranties.findBySerialNumber(serial);
    if (!warranty) {
      throw new NotFoundException('گارانتی با این شماره سریال یافت نشد');
    }
    return {
      serialNumber: warranty.serialNumber,
      productTitle: warranty.orderItem.productTitle,
      sku: warranty.orderItem.sku,
      startsAt: warranty.startsAt,
      endsAt: warranty.endsAt,
      isActive: warranty.endsAt.getTime() >= Date.now(),
    };
  }
}
