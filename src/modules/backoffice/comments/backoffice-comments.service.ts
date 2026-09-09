import { Injectable, NotFoundException } from '@nestjs/common';
import type { CommentStatus } from '@prisma/client';
import { CommentRepository, type CommentAdminRow } from '../../catalog/repositories/comment.repository';

function toView(c: CommentAdminRow) {
  return {
    id: c.id,
    rating: c.rating,
    body: c.body,
    status: c.status,
    author: { name: c.user.fullName, mobile: c.user.mobile },
    product: { title: c.product.title, slug: c.product.slug },
    createdAt: c.createdAt,
  };
}

@Injectable()
export class BackofficeCommentsService {
  constructor(private readonly comments: CommentRepository) {}

  async list(query: { skip: number; take: number; status: CommentStatus }) {
    const [rows, total] = await this.comments.paginateForAdmin(
      { status: query.status },
      query.skip,
      query.take,
    );
    return { items: rows.map(toView), total, skip: query.skip, take: query.take };
  }

  async setStatus(id: string, status: CommentStatus) {
    const existing = await this.comments.findById(id);
    if (!existing) throw new NotFoundException('نظر یافت نشد');
    const updated = await this.comments.setStatus(id, status);
    return { id: updated.id, status: updated.status };
  }
}
