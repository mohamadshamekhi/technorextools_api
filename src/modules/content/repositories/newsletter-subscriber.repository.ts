import { Injectable } from '@nestjs/common';
import type { NewsletterSubscriber, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `newsletter_subscribers` collection. */
@Injectable()
export class NewsletterSubscriberRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByContact(contact: string): Promise<NewsletterSubscriber | null> {
    return this.prisma.newsletterSubscriber.findUnique({ where: { contact } });
  }

  create(contact: string): Promise<NewsletterSubscriber> {
    return this.prisma.newsletterSubscriber.create({ data: { contact } });
  }

  /** Re-subscribe a row that was deactivated before. */
  activate(id: string): Promise<NewsletterSubscriber> {
    return this.prisma.newsletterSubscriber.update({ where: { id }, data: { isActive: true } });
  }

  paginate(
    where: Prisma.NewsletterSubscriberWhereInput,
    skip: number,
    take: number,
  ): Promise<[NewsletterSubscriber[], number]> {
    return Promise.all([
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.newsletterSubscriber.count({ where }),
    ]);
  }

  /** Active subscribers who joined after `since` (all of them when null). */
  countActiveSince(since: Date | null): Promise<number> {
    return this.prisma.newsletterSubscriber.count({
      where: { isActive: true, ...(since ? { createdAt: { gt: since } } : {}) },
    });
  }
}
