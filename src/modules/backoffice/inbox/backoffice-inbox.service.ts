import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContactMessage, ContactMessageStatus, NewsletterSubscriber } from '@prisma/client';
import { ContactMessageRepository } from '../../content/repositories/contact-message.repository';
import { NewsletterSubscriberRepository } from '../../content/repositories/newsletter-subscriber.repository';

function toMessageView(m: ContactMessage) {
  return {
    id: m.id,
    name: m.name,
    phone: m.phone,
    subject: m.subject,
    message: m.message,
    status: m.status,
    createdAt: m.createdAt,
  };
}

function toSubscriberView(s: NewsletterSubscriber) {
  return { id: s.id, contact: s.contact, isActive: s.isActive, createdAt: s.createdAt };
}

@Injectable()
export class BackofficeInboxService {
  constructor(
    private readonly messages: ContactMessageRepository,
    private readonly newsletter: NewsletterSubscriberRepository,
  ) {}

  async listMessages(query: { skip: number; take: number; status?: ContactMessageStatus }) {
    const [rows, total] = await this.messages.paginate(
      query.status ? { status: query.status } : {},
      query.skip,
      query.take,
    );
    return { items: rows.map(toMessageView), total, skip: query.skip, take: query.take };
  }

  async setMessageStatus(id: string, status: ContactMessageStatus) {
    if (!(await this.messages.findById(id))) {
      throw new NotFoundException('پیام یافت نشد');
    }
    const updated = await this.messages.setStatus(id, status);
    return { id: updated.id, status: updated.status };
  }

  async listSubscribers(query: { skip: number; take: number; isActive?: boolean }) {
    const [rows, total] = await this.newsletter.paginate(
      query.isActive === undefined ? {} : { isActive: query.isActive },
      query.skip,
      query.take,
    );
    return { items: rows.map(toSubscriberView), total, skip: query.skip, take: query.take };
  }
}
