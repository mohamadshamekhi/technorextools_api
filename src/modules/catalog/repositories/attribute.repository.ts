import { Injectable } from '@nestjs/common';
import type { Attribute, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * All Prisma access for the `attributes` collection — the dynamic attribute
 * definitions inside an attribute group (a category's "attribute family").
 */
@Injectable()
export class AttributeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Attribute | null> {
    return this.prisma.attribute.findUnique({ where: { id } });
  }

  findByGroupId(attributeGroupId: string): Promise<Attribute[]> {
    return this.prisma.attribute.findMany({
      where: { attributeGroupId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** All attributes of every group passed in — used to validate product attribute values. */
  findManyByGroupIds(attributeGroupIds: string[]): Promise<Attribute[]> {
    if (attributeGroupIds.length === 0) return Promise.resolve([]);
    return this.prisma.attribute.findMany({
      where: { attributeGroupId: { in: attributeGroupIds } },
    });
  }

  create(data: Prisma.AttributeCreateInput): Promise<Attribute> {
    return this.prisma.attribute.create({ data });
  }

  update(id: string, data: Prisma.AttributeUpdateInput): Promise<Attribute> {
    return this.prisma.attribute.update({ where: { id }, data });
  }

  delete(id: string): Promise<Attribute> {
    return this.prisma.attribute.delete({ where: { id } });
  }
}
