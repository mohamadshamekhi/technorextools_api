import { Injectable } from '@nestjs/common';
import type { Address, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `addresses` collection — customer shipping addresses. */
@Injectable()
export class AddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Address | null> {
    return this.prisma.address.findUnique({ where: { id } });
  }

  findByUser(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  create(userId: string, data: Omit<Prisma.AddressCreateInput, 'user'>): Promise<Address> {
    return this.prisma.address.create({ data: { ...data, user: { connect: { id: userId } } } });
  }

  update(id: string, data: Prisma.AddressUpdateInput): Promise<Address> {
    return this.prisma.address.update({ where: { id }, data });
  }

  delete(id: string): Promise<Address> {
    return this.prisma.address.delete({ where: { id } });
  }

  /** Clear the default flag on every other address of a user (used before setting a new one). */
  async clearDefaultForUser(userId: string, exceptId?: string): Promise<void> {
    await this.prisma.address.updateMany({
      where: { userId, isDefault: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }
}
