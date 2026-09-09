import { Injectable } from '@nestjs/common';
import type { Attribute, AttributeGroup, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type AttributeGroupWithAttributes = AttributeGroup & { attributes: Attribute[] };

/**
 * All Prisma access for the `attribute_groups` collection. The `attributes`
 * child rows are managed here alongside their group — an attribute never
 * exists outside a family.
 */
@Injectable()
export class AttributeGroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<AttributeGroup | null> {
    return this.prisma.attributeGroup.findUnique({ where: { id } });
  }

  findByIdWithAttributes(id: string): Promise<AttributeGroupWithAttributes | null> {
    return this.prisma.attributeGroup.findUnique({ where: { id }, include: { attributes: true } });
  }

  findByCategoryId(categoryId: string): Promise<AttributeGroupWithAttributes[]> {
    return this.prisma.attributeGroup.findMany({
      where: { categoryId },
      orderBy: { createdAt: 'asc' },
      include: { attributes: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  countByCategoryId(categoryId: string): Promise<number> {
    return this.prisma.attributeGroup.count({ where: { categoryId } });
  }

  create(data: Prisma.AttributeGroupCreateInput): Promise<AttributeGroup> {
    return this.prisma.attributeGroup.create({ data });
  }

  update(id: string, data: Prisma.AttributeGroupUpdateInput): Promise<AttributeGroup> {
    return this.prisma.attributeGroup.update({ where: { id }, data });
  }

  delete(id: string): Promise<AttributeGroup> {
    return this.prisma.attributeGroup.delete({ where: { id } });
  }
}
