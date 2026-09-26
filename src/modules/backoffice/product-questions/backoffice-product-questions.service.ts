import { Injectable, NotFoundException } from '@nestjs/common';
import type { ProductQuestionStatus } from '@prisma/client';
import {
  ProductQuestionRepository,
  type QuestionAdminRow,
} from '../../catalog/repositories/product-question.repository';

function toView(q: QuestionAdminRow) {
  return {
    id: q.id,
    question: q.question,
    answer: q.answer,
    status: q.status,
    author: { name: q.user.fullName, mobile: q.user.mobile },
    product: { title: q.product.title, slug: q.product.slug },
    createdAt: q.createdAt,
    answeredAt: q.answeredAt,
  };
}

@Injectable()
export class BackofficeProductQuestionsService {
  constructor(private readonly questions: ProductQuestionRepository) {}

  async list(query: { skip: number; take: number; status: ProductQuestionStatus }) {
    const [rows, total] = await this.questions.paginateForAdmin(
      { status: query.status },
      query.skip,
      query.take,
    );
    return { items: rows.map(toView), total, skip: query.skip, take: query.take };
  }

  /** Answering publishes the question in the same write — no separate approve step. */
  async answer(id: string, answer: string, staffUserId: string) {
    await this.requireQuestion(id);
    const updated = await this.questions.answer(id, answer, staffUserId);
    return { id: updated.id, status: updated.status, answer: updated.answer };
  }

  async setStatus(id: string, status: ProductQuestionStatus) {
    await this.requireQuestion(id);
    const updated = await this.questions.setStatus(id, status);
    return { id: updated.id, status: updated.status };
  }

  private async requireQuestion(id: string): Promise<void> {
    if (!(await this.questions.findById(id))) {
      throw new NotFoundException('پرسش یافت نشد');
    }
  }
}
