import { Injectable } from '@nestjs/common';
import type { Article, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `articles` collection (blog posts). */
@Injectable()
export class ArticleRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Article | null> {
    return this.prisma.article.findUnique({ where: { id } });
  }

  findBySlug(slug: string): Promise<Article | null> {
    return this.prisma.article.findUnique({ where: { slug } });
  }

  paginate(
    where: Prisma.ArticleWhereInput,
    skip: number,
    take: number,
    orderBy: Prisma.ArticleOrderByWithRelationInput = { createdAt: 'desc' },
  ): Promise<[Article[], number]> {
    return Promise.all([
      this.prisma.article.findMany({ where, orderBy, skip, take }),
      this.prisma.article.count({ where }),
    ]);
  }

  create(data: Prisma.ArticleCreateInput): Promise<Article> {
    return this.prisma.article.create({ data });
  }

  update(id: string, data: Prisma.ArticleUpdateInput): Promise<Article> {
    return this.prisma.article.update({ where: { id }, data });
  }

  delete(id: string): Promise<Article> {
    return this.prisma.article.delete({ where: { id } });
  }
}
