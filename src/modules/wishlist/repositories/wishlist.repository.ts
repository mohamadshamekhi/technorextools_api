import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const withProduct = {
  product: {
    include: { brand: { select: { title: true, slug: true } } },
  },
} satisfies Prisma.WishlistItemInclude;

export type WishlistRow = Prisma.WishlistItemGetPayload<{ include: typeof withProduct }>;

/** All Prisma access for the `wishlists` collection. */
@Injectable()
export class WishlistRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUser(userId: string): Promise<WishlistRow[]> {
    return this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: withProduct,
    });
  }

  /** Idempotent add — returns nothing, a duplicate is silently ignored. */
  async add(userId: string, productId: string): Promise<void> {
    try {
      await this.prisma.wishlistItem.create({ data: { userId, productId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }

  async remove(userId: string, productId: string): Promise<void> {
    await this.prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  }
}
