import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { Category } from '@prisma/client';
import { CategoriesService } from './categories.service';
import type { AttributeGroupRepository } from '../../catalog/repositories/attribute-group.repository';
import type { AttributeRepository } from '../../catalog/repositories/attribute.repository';
import type { CategoryRepository } from '../../catalog/repositories/category.repository';

const row = (over: Partial<Category> = {}): Category => ({
  id: 'c1',
  parentId: null,
  title: 'ابزار بادی',
  slug: 'pneumatic-tools',
  imageUrl: null,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

function make(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const categories = {
    findById: overrides.findById ?? jest.fn().mockResolvedValue(null),
    findByIdWithCounts:
      overrides.findByIdWithCounts ??
      jest.fn().mockResolvedValue({
        ...row(),
        parent: null,
        _count: { children: 0, products: 0, attributeGroups: 0 },
      }),
    findBySlug: overrides.findBySlug ?? jest.fn().mockResolvedValue(null),
    findMany: overrides.findMany ?? jest.fn().mockResolvedValue([]),
    paginate: overrides.paginate ?? jest.fn().mockResolvedValue({ items: [], total: 0 }),
    create: overrides.create ?? jest.fn().mockResolvedValue(row()),
    update: overrides.update ?? jest.fn().mockResolvedValue(row()),
    delete: overrides.delete ?? jest.fn().mockResolvedValue(row()),
  } as unknown as CategoryRepository;
  const attributeGroups = {} as unknown as AttributeGroupRepository;
  const attributes = {} as unknown as AttributeRepository;
  return { service: new CategoriesService(categories, attributeGroups, attributes), categories };
}

describe('CategoriesService', () => {
  it('rejects a create with a duplicate slug', async () => {
    const { service } = make({ findBySlug: jest.fn().mockResolvedValue(row()) });
    await expect(
      service.create({
        title: 'ابزار بادی',
        slug: 'pneumatic-tools',
        imageUrl: null,
        sortOrder: 0,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a create with a missing parent', async () => {
    const { service } = make();
    await expect(
      service.create({
        title: 'پیچ‌گوشتی بادی',
        slug: 'air-screwdriver',
        imageUrl: null,
        parentId: 'missingparent0000000000',
        sortOrder: 0,
        isActive: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a category becoming its own parent', async () => {
    const { service } = make({ findById: jest.fn().mockResolvedValue(row()) });
    await expect(service.update('c1', { parentId: 'c1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a parent choice that would create a cycle', async () => {
    // chain: grandchild(c3) → child(c2) → root(c1); moving c1 under c3 must fail
    const rowsById = new Map([
      ['c1', row({ id: 'c1', parentId: null })],
      ['c2', row({ id: 'c2', parentId: 'c1' })],
      ['c3', row({ id: 'c3', parentId: 'c2' })],
    ]);
    const { service } = make({
      findById: jest.fn((id: string) => rowsById.get(id) ?? null),
    });
    await expect(service.update('c1', { parentId: 'c3' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('blocks deletion while child categories exist', async () => {
    const { service } = make({
      findByIdWithCounts: jest.fn().mockResolvedValue({
        ...row(),
        parent: null,
        _count: { children: 2, products: 0, attributeGroups: 0 },
      }),
    });
    await expect(service.delete('c1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks deletion while products are attached', async () => {
    const { service } = make({
      findByIdWithCounts: jest.fn().mockResolvedValue({
        ...row(),
        parent: null,
        _count: { children: 0, products: 5, attributeGroups: 1 },
      }),
    });
    await expect(service.delete('c1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not-found when deleting a missing category', async () => {
    const { service } = make({ findByIdWithCounts: jest.fn().mockResolvedValue(null) });
    await expect(service.delete('c1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('builds a nested tree from flat rows', async () => {
    const { service } = make({
      findMany: jest
        .fn()
        .mockResolvedValue([
          row({ id: 'c1', slug: 'root', sortOrder: 1 }),
          row({ id: 'c2', parentId: 'c1', title: 'فرزند', slug: 'child', sortOrder: 0 }),
        ]),
    });
    const tree = await service.tree();
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.slug).toBe('child');
  });
});
