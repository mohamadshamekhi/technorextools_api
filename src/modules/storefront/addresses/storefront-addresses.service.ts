import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Address } from '@prisma/client';
import { AddressRepository } from '../../address/repositories/address.repository';
import type { CreateAddressInput, UpdateAddressInput } from './storefront-addresses.schemas';

export interface AddressView {
  id: string;
  receiverName: string;
  receiverMobile: string;
  province: string;
  city: string;
  fullAddress: string;
  postalCode: string;
  isDefault: boolean;
}

function toView(a: Address): AddressView {
  return {
    id: a.id,
    receiverName: a.receiverName,
    receiverMobile: a.receiverMobile,
    province: a.province,
    city: a.city,
    fullAddress: a.fullAddress,
    postalCode: a.postalCode,
    isDefault: a.isDefault,
  };
}

@Injectable()
export class StorefrontAddressesService {
  constructor(private readonly addresses: AddressRepository) {}

  async list(userId: string): Promise<AddressView[]> {
    const rows = await this.addresses.findByUser(userId);
    return rows.map(toView);
  }

  /** Load an address and assert it belongs to the caller. */
  async ownedOrThrow(userId: string, id: string): Promise<Address> {
    const address = await this.addresses.findById(id);
    if (!address) throw new NotFoundException('آدرس یافت نشد');
    if (address.userId !== userId) throw new ForbiddenException('این آدرس متعلق به شما نیست');
    return address;
  }

  async create(userId: string, input: CreateAddressInput): Promise<AddressView> {
    const existing = await this.addresses.findByUser(userId);
    const isDefault = input.isDefault || existing.length === 0;
    const created = await this.addresses.create(userId, { ...input, isDefault });
    if (isDefault) await this.addresses.clearDefaultForUser(userId, created.id);
    return toView(created);
  }

  async update(userId: string, id: string, input: UpdateAddressInput): Promise<AddressView> {
    await this.ownedOrThrow(userId, id);
    const updated = await this.addresses.update(id, input);
    if (input.isDefault) await this.addresses.clearDefaultForUser(userId, id);
    return toView(updated);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.ownedOrThrow(userId, id);
    await this.addresses.delete(id);
  }
}
