import { Injectable } from '@nestjs/common';
import { ProductQuestionStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const publicInclude = {
  user: { select: { fullName: true } },
} satisfies Prisma.ProductQuestionInclude;
const adminInclude = {
  user: { select: { fullName: true, mobile: true } },
  product: { select: { title: true, slug: true } },
} satisfies Prisma.ProductQuestionInclude;

export type QuestionPublicRow = Prisma.ProductQuestionGetPayload<{ include: typeof publicInclude }>;
export type QuestionAdminRow = Prisma.ProductQuestionGetPayload<{ include: typeof adminInclude }>;

/**
 * All Prisma access for the `product_questions` collection. Product-owned like
 * `comments`: the storefront reads approved rows and posts new ones, the
 * backoffice answers and moderates them.
 */
@Injectable()
export class ProductQuestionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findApprovedByProduct(productId: string): Promise<QuestionPublicRow[]> {
    return this.prisma.productQuestion.findMany({
      where: { productId, status: ProductQuestionStatus.approved },
      orderBy: { createdAt: 'desc' },
      include: publicInclude,
    });
  }

  findById(id: string) {
    return this.prisma.productQuestion.findUnique({ where: { id } });
  }

  create(data: { productId: string; userId: string; question: string }) {
    return this.prisma.productQuestion.create({
      data: { ...data, status: ProductQuestionStatus.pending },
    });
  }

  /** Staff answer — an answered question is published in the same write. */
  answer(id: string, answer: string, answeredById: string) {
    return this.prisma.productQuestion.update({
      where: { id },
      data: {
        answer,
        answeredById,
        answeredAt: new Date(),
        status: ProductQuestionStatus.approved,
      },
    });
  }

  setStatus(id: string, status: ProductQuestionStatus) {
    return this.prisma.productQuestion.update({ where: { id }, data: { status } });
  }

  paginateForAdmin(
    where: Prisma.ProductQuestionWhereInput,
    skip: number,
    take: number,
  ): Promise<[QuestionAdminRow[], number]> {
    return Promise.all([
      this.prisma.productQuestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: adminInclude,
      }),
      this.prisma.productQuestion.count({ where }),
    ]);
  }

  /** Questions awaiting an answer/moderation — drives the backoffice sidebar badge. */
  countPending(): Promise<number> {
    return this.prisma.productQuestion.count({ where: { status: ProductQuestionStatus.pending } });
  }
}
