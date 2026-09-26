import { StorefrontContactService } from './storefront-contact.service';
import type { ContactMessageRepository } from '../../content/repositories/contact-message.repository';
import type { NewsletterSubscriberRepository } from '../../content/repositories/newsletter-subscriber.repository';
import { newsletterSchema } from './storefront-contact.schemas';

function build(existing: { id: string; isActive: boolean } | null = null) {
  const messages = {
    create: jest.fn().mockResolvedValue({ id: 'm1' }),
  } as unknown as ContactMessageRepository;
  const newsletter = {
    findByContact: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue({ id: 'n1' }),
    activate: jest.fn().mockResolvedValue({ id: 'n1' }),
  } as unknown as NewsletterSubscriberRepository;
  return { svc: new StorefrontContactService(messages, newsletter), messages, newsletter };
}

describe('StorefrontContactService', () => {
  it('stores a contact message with a null subject when none is sent', async () => {
    const { svc, messages } = build();
    await svc.submit({ name: 'علی', phone: '02112345678', message: 'سلام، سوال دارم.' });
    expect(messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ subject: null, name: 'علی' }),
    );
  });

  it('normalises a mobile to 09… so one person is one subscriber row', async () => {
    const { svc, newsletter } = build();
    await svc.subscribe({ contact: '+989123456789' });
    expect(newsletter.create).toHaveBeenCalledWith('09123456789');
  });

  it('is idempotent: an existing subscriber is not created twice', async () => {
    const { svc, newsletter } = build({ id: 'n1', isActive: true });
    expect(await svc.subscribe({ contact: 'A@Example.com' })).toEqual({ created: false });
    expect(newsletter.create).not.toHaveBeenCalled();
    expect(newsletter.findByContact).toHaveBeenCalledWith('a@example.com');
  });

  it('re-activates a previously unsubscribed contact', async () => {
    const { svc, newsletter } = build({ id: 'n1', isActive: false });
    await svc.subscribe({ contact: 'a@example.com' });
    expect(newsletter.activate).toHaveBeenCalledWith('n1');
  });
});

describe('newsletterSchema', () => {
  it('accepts an email or an Iranian mobile and rejects anything else', () => {
    expect(newsletterSchema.safeParse({ contact: 'a@b.com' }).success).toBe(true);
    expect(newsletterSchema.safeParse({ contact: '09123456789' }).success).toBe(true);
    expect(newsletterSchema.safeParse({ contact: 'سلام' }).success).toBe(false);
  });
});
