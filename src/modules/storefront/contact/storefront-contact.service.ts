import { Injectable } from '@nestjs/common';
import { ContactMessageRepository } from '../../content/repositories/contact-message.repository';
import { NewsletterSubscriberRepository } from '../../content/repositories/newsletter-subscriber.repository';
import type { ContactMessageInput, NewsletterInput } from './storefront-contact.schemas';

@Injectable()
export class StorefrontContactService {
  constructor(
    private readonly messages: ContactMessageRepository,
    private readonly newsletter: NewsletterSubscriberRepository,
  ) {}

  async submit(input: ContactMessageInput): Promise<{ id: string }> {
    const row = await this.messages.create({
      name: input.name,
      phone: input.phone,
      subject: input.subject ?? null,
      message: input.message,
    });
    return { id: row.id };
  }

  /**
   * Idempotent: a contact that is already subscribed returns `created: false`
   * (200), a previously unsubscribed row is re-activated.
   */
  async subscribe(input: NewsletterInput): Promise<{ created: boolean }> {
    const contact = normaliseContact(input.contact);
    const existing = await this.newsletter.findByContact(contact);
    if (existing) {
      if (!existing.isActive) await this.newsletter.activate(existing.id);
      return { created: false };
    }
    await this.newsletter.create(contact);
    return { created: true };
  }
}

/** Emails lower-cased; mobiles stored as `09…` so one person is one row. */
function normaliseContact(value: string): string {
  const v = value.trim();
  if (v.includes('@')) return v.toLowerCase();
  return `0${v.replace(/^(\+98|0098|98|0)/, '')}`;
}
