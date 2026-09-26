import { Injectable } from '@nestjs/common';
import type { Prisma, ProductDocument, ProductDocumentType } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface NewProductDocument {
  productId: string;
  mediaId: string;
  type: ProductDocumentType;
  title: string;
  locale: string;
  sortOrder: number;
}

/** All Prisma access for the `product_documents` collection (catalogues, manuals, certificates). */
@Injectable()
export class ProductDocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ProductDocument | null> {
    return this.prisma.productDocument.findUnique({ where: { id } });
  }

  findByProduct(productId: string): Promise<ProductDocument[]> {
    return this.prisma.productDocument.findMany({
      where: { productId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Documents of many products in one query — avoids an N+1 on list views. */
  findByProducts(productIds: string[]): Promise<ProductDocument[]> {
    if (productIds.length === 0) return Promise.resolve([]);
    return this.prisma.productDocument.findMany({
      where: { productId: { in: productIds } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  create(data: NewProductDocument): Promise<ProductDocument> {
    return this.prisma.productDocument.create({ data });
  }

  update(id: string, data: Prisma.ProductDocumentUpdateInput): Promise<ProductDocument> {
    return this.prisma.productDocument.update({ where: { id }, data });
  }

  delete(id: string): Promise<ProductDocument> {
    return this.prisma.productDocument.delete({ where: { id } });
  }
}
