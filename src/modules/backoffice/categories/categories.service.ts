import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Attribute, AttributeGroup, Category, Prisma } from '@prisma/client';
import { AttributeGroupRepository } from '../../catalog/repositories/attribute-group.repository';
import { AttributeRepository } from '../../catalog/repositories/attribute.repository';
import { CategoryRepository } from '../../catalog/repositories/category.repository';
import type {
  CreateAttributeGroupInput,
  CreateAttributeInput,
  CreateCategoryInput,
  ListCategoriesQuery,
  UpdateAttributeGroupInput,
  UpdateAttributeInput,
  UpdateCategoryInput,
} from './categories.schemas';

export interface CategoryView {
  id: string;
  parentId: string | null;
  parentTitle: string | null;
  title: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  childrenCount: number;
  productsCount: number;
  attributeGroupsCount: number;
  createdAt: string;
}

export interface CategoryTreeNode {
  id: string;
  title: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  children: CategoryTreeNode[];
}

export interface AttributeView {
  id: string;
  title: string;
  unit: string | null;
  inputType: Attribute['inputType'];
  options: string[];
  sortOrder: number;
}

export interface AttributeGroupView {
  id: string;
  categoryId: string;
  title: string;
  attributes: AttributeView[];
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly attributeGroups: AttributeGroupRepository,
    private readonly attributes: AttributeRepository,
  ) {}

  // ── Categories ───────────────────────────────────────────────────────────

  async list(
    query: ListCategoriesQuery,
  ): Promise<{ items: CategoryView[]; total: number; skip: number; take: number }> {
    const and: Prisma.CategoryWhereInput[] = [];
    if (query.search) {
      and.push({ title: { contains: query.search } });
    }
    if (query.isActive !== undefined) {
      and.push({ isActive: query.isActive });
    }
    const where = and.length ? { AND: and } : {};
    const { items, total } = await this.categories.paginate(where, query.skip, query.take);
    return { items: items.map(toCategoryView), total, skip: query.skip, take: query.take };
  }

  async tree(): Promise<CategoryTreeNode[]> {
    const rows = await this.categories.findMany();
    return buildTree(rows);
  }

  async create(input: CreateCategoryInput): Promise<CategoryView> {
    await this.ensureSlugFree(input.slug);
    if (input.parentId) {
      await this.ensureParentExists(input.parentId);
    }
    const category = await this.categories.create({
      title: input.title,
      slug: input.slug,
      imageUrl: input.imageUrl,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      ...(input.parentId ? { parent: { connect: { id: input.parentId } } } : {}),
    });
    return toCategoryView({
      ...category,
      parent: null,
      _count: { children: 0, products: 0, attributeGroups: 0 },
    });
  }

  async update(id: string, input: UpdateCategoryInput): Promise<CategoryView> {
    const category = await this.getByIdRow(id);
    if (input.slug && input.slug !== category.slug) {
      await this.ensureSlugFree(input.slug);
    }
    let parentConnect:
      { parent: { connect: { id: string } } } | { parent: { disconnect: true } } | undefined;
    if (input.parentId !== undefined) {
      if (input.parentId === null) {
        parentConnect = { parent: { disconnect: true } };
      } else {
        if (input.parentId === id) {
          throw new BadRequestException('دسته‌بندی نمی‌تواند والد خودش باشد');
        }
        await this.ensureNoCycle(id, input.parentId);
        parentConnect = { parent: { connect: { id: input.parentId } } };
      }
    }
    const { title, slug, imageUrl, sortOrder, isActive } = input;
    const updated = await this.categories.update(id, {
      ...(title !== undefined ? { title } : {}),
      ...(slug !== undefined ? { slug } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...parentConnect,
    });
    return toCategoryView({
      ...updated,
      parent: null,
      _count: { children: 0, products: 0, attributeGroups: 0 },
    });
  }

  async delete(id: string): Promise<void> {
    const category = await this.categories.findByIdWithCounts(id);
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }
    if (category._count.children > 0) {
      throw new ConflictException('ابتدا زیردسته‌های این دسته‌بندی را حذف کنید');
    }
    if (category._count.products > 0) {
      throw new ConflictException('به این دسته‌بندی محصول متصل است و حذف نمی‌شود');
    }
    await this.categories.delete(id);
  }

  // ── Attribute groups & attributes ────────────────────────────────────────

  async listAttributeGroups(categoryId: string): Promise<AttributeGroupView[]> {
    await this.ensureCategoryExists(categoryId);
    const groups = await this.attributeGroups.findByCategoryId(categoryId);
    return groups.map(toAttributeGroupView);
  }

  async createAttributeGroup(
    categoryId: string,
    input: CreateAttributeGroupInput,
  ): Promise<AttributeGroupView> {
    await this.ensureCategoryExists(categoryId);
    const group = await this.attributeGroups.create({
      title: input.title,
      category: { connect: { id: categoryId } },
    });
    return toAttributeGroupView({ ...group, attributes: [] });
  }

  async updateAttributeGroup(
    id: string,
    input: UpdateAttributeGroupInput,
  ): Promise<AttributeGroupView> {
    const group = await this.attributeGroups.findByIdWithAttributes(id);
    if (!group) {
      throw new NotFoundException('گروه ویژگی یافت نشد');
    }
    const updated = await this.attributeGroups.update(id, input);
    return toAttributeGroupView({ ...updated, attributes: group.attributes });
  }

  async deleteAttributeGroup(id: string): Promise<void> {
    const group = await this.attributeGroups.findById(id);
    if (!group) {
      throw new NotFoundException('گروه ویژگی یافت نشد');
    }
    await this.attributeGroups.delete(id);
  }

  async createAttribute(groupId: string, input: CreateAttributeInput): Promise<AttributeView> {
    const group = await this.attributeGroups.findById(groupId);
    if (!group) {
      throw new NotFoundException('گروه ویژگی یافت نشد');
    }
    const attribute = await this.attributes.create({
      title: input.title,
      unit: input.unit ?? undefined,
      inputType: input.inputType,
      options: input.options,
      sortOrder: input.sortOrder,
      attributeGroup: { connect: { id: groupId } },
    });
    return toAttributeView(attribute);
  }

  async updateAttribute(id: string, input: UpdateAttributeInput): Promise<AttributeView> {
    const attribute = await this.attributes.findById(id);
    if (!attribute) {
      throw new NotFoundException('ویژگی یافت نشد');
    }
    const merged: { inputType: Attribute['inputType']; options: string[] } = {
      inputType: input.inputType ?? attribute.inputType,
      options: input.options ?? attribute.options,
    };
    if (merged.inputType === 'select' && merged.options.length === 0) {
      throw new BadRequestException('برای نوع انتخابی، حداقل یک گزینه لازم است');
    }
    const updated = await this.attributes.update(id, {
      ...input,
      ...(input.unit !== undefined ? { unit: input.unit ?? undefined } : {}),
    });
    return toAttributeView(updated);
  }

  async deleteAttribute(id: string): Promise<void> {
    const attribute = await this.attributes.findById(id);
    if (!attribute) {
      throw new NotFoundException('ویژگی یافت نشد');
    }
    await this.attributes.delete(id);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private async getByIdRow(id: string): Promise<Category> {
    const category = await this.categories.findById(id);
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }
    return category;
  }

  private async ensureCategoryExists(id: string): Promise<void> {
    const category = await this.categories.findById(id);
    if (!category) {
      throw new NotFoundException('دسته‌بندی یافت نشد');
    }
  }

  private async ensureParentExists(id: string): Promise<void> {
    const parent = await this.categories.findById(id);
    if (!parent) {
      throw new BadRequestException('دسته والد انتخاب‌شده وجود ندارد');
    }
  }

  private async ensureSlugFree(slug: string): Promise<void> {
    const existing = await this.categories.findBySlug(slug);
    if (existing) {
      throw new ConflictException('این اسلاگ قبلاً استفاده شده');
    }
  }

  /** Walk up the ancestor chain from `newParentId`; hitting `categoryId` means a cycle. */
  private async ensureNoCycle(categoryId: string, newParentId: string): Promise<void> {
    let cursorId: string | null = newParentId;
    while (cursorId) {
      if (cursorId === categoryId) {
        throw new BadRequestException('انتخاب این والد، حلقه در درخت دسته‌بندی ایجاد می‌کند');
      }
      const parent: Category | null = await this.categories.findById(cursorId);
      cursorId = parent?.parentId ?? null;
    }
  }
}

function toCategoryView(
  category: Category & {
    parent: Category | null;
    _count: { children: number; products: number; attributeGroups: number };
  },
): CategoryView {
  return {
    id: category.id,
    parentId: category.parentId,
    parentTitle: category.parent?.title ?? null,
    title: category.title,
    slug: category.slug,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    isActive: category.isActive,
    childrenCount: category._count.children,
    productsCount: category._count.products,
    attributeGroupsCount: category._count.attributeGroups,
    createdAt: category.createdAt.toISOString(),
  };
}

function buildTree(rows: Category[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      title: row.title,
      slug: row.slug,
      imageUrl: row.imageUrl,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      children: [],
    });
  }
  const roots: CategoryTreeNode[] = [];
  for (const row of rows) {
    const node = byId.get(row.id);
    const parent = row.parentId ? byId.get(row.parentId) : undefined;
    if (parent && node) {
      parent.children.push(node);
    } else if (node) {
      roots.push(node);
    }
  }
  return roots;
}

function toAttributeGroupView(
  group: AttributeGroup & { attributes: Attribute[] },
): AttributeGroupView {
  return {
    id: group.id,
    categoryId: group.categoryId,
    title: group.title,
    attributes: group.attributes.map(toAttributeView),
  };
}

function toAttributeView(attribute: Attribute): AttributeView {
  return {
    id: attribute.id,
    title: attribute.title,
    unit: attribute.unit,
    inputType: attribute.inputType,
    options: attribute.options,
    sortOrder: attribute.sortOrder,
  };
}
