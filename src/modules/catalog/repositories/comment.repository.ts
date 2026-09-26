import { Injectable } from '@nestjs/common';
import { CommentStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const publicInclude = {
  user: { select: { fullName: true } },
} satisfies Prisma.CommentInclude;
const adminInclude = {
  user: { select: { fullName: true, mobile: true } },
  product: { select: { title: true, slug: true } },
} satisfies Prisma.CommentInclude;

export type CommentPublicRow = Prisma.CommentGetPayload<{ include: typeof publicInclude }>;
export type CommentAdminRow = Prisma.CommentGetPayload<{ include: typeof adminInclude }>;

/**
 * All Prisma access for the `comments` collection (product reviews). Lives in
 * the catalog module because a comment is product-owned; the storefront reads
 * approved rows and posts new ones, the backoffice moderates them.
 */
@Injectable()
export class CommentRepository {
  constructor(private readonly prisma: PrismaService) {}

  paginateApprovedByProduct(
    productId: string,
    skip: number,
    take: number,
  ): Promise<[CommentPublicRow[], number]> {
    const where: Prisma.CommentWhereInput = { productId, status: CommentStatus.approved };
    return Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: publicInclude,
      }),
      this.prisma.comment.count({ where }),
    ]);
  }

  findByUserAndProduct(userId: string, productId: string) {
    return this.prisma.comment.findFirst({ where: { userId, productId } });
  }

  create(data: { userId: string; productId: string; rating: number; body: string }) {
    return this.prisma.comment.create({ data: { ...data, status: CommentStatus.pending } });
  }

  findById(id: string) {
    return this.prisma.comment.findUnique({ where: { id } });
  }

  setStatus(id: string, status: CommentStatus) {
    return this.prisma.comment.update({ where: { id }, data: { status } });
  }

  paginateForAdmin(
    where: Prisma.CommentWhereInput,
    skip: number,
    take: number,
  ): Promise<[CommentAdminRow[], number]> {
    return Promise.all([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: adminInclude,
      }),
      this.prisma.comment.count({ where }),
    ]);
  }
}
