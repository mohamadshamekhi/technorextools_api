import { Injectable } from '@nestjs/common';
import { CommentRepository } from '../../catalog/repositories/comment.repository';
import { ProductQuestionRepository } from '../../catalog/repositories/product-question.repository';
import { ContactMessageRepository } from '../../content/repositories/contact-message.repository';
import { NewsletterSubscriberRepository } from '../../content/repositories/newsletter-subscriber.repository';
import type { AuthenticatedUser } from '../../auth/token.types';
import { TicketRepository } from '../../support/repositories/ticket.repository';
import { RepairRequestRepository } from '../../warranty/repositories/repair-request.repository';
import { AdminSeenMarkerRepository } from './admin-seen-marker.repository';

/** Sections whose "new" state is tracked per admin by a seen-at timestamp. */
export const SEEN_SECTIONS = ['newsletter'] as const;
export type SeenSection = (typeof SEEN_SECTIONS)[number];

/** Badge key → permission needed to see it (same as the section's list route). */
const BADGE_PERMISSIONS = {
  tickets: 'tickets.handle',
  comments: 'comments.moderate',
  repairs: 'repairs.manage',
  warranties: 'warranties.manage',
  productQuestions: 'product-questions.moderate',
  contactMessages: 'contact.view',
  newsletter: 'newsletter.view',
} as const;
type BadgeKey = keyof typeof BADGE_PERMISSIONS;

export type BadgeCounts = Partial<Record<BadgeKey, number>>;

/**
 * Sidebar badges: how many items in each support/content section still wait on
 * an admin. Keys the caller has no permission for are omitted.
 */
@Injectable()
export class BackofficeBadgesService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly comments: CommentRepository,
    private readonly repairs: RepairRequestRepository,
    private readonly questions: ProductQuestionRepository,
    private readonly contactMessages: ContactMessageRepository,
    private readonly newsletter: NewsletterSubscriberRepository,
    private readonly seenMarkers: AdminSeenMarkerRepository,
  ) {}

  async counts(user: AuthenticatedUser): Promise<BadgeCounts> {
    const counters: Record<BadgeKey, () => Promise<number>> = {
      tickets: () => this.tickets.countAwaitingStaff(),
      comments: () => this.comments.countPending(),
      repairs: () => this.repairs.countReceived(),
      warranties: () => this.repairs.countReceivedUnderWarranty(),
      productQuestions: () => this.questions.countPending(),
      contactMessages: () => this.contactMessages.countNew(),
      newsletter: async () =>
        this.newsletter.countActiveSince(await this.seenMarkers.findSeenAt(user.id, 'newsletter')),
    };
    const keys = (Object.keys(BADGE_PERMISSIONS) as BadgeKey[]).filter(
      (key) => user.isSuperadmin || user.permissions.includes(BADGE_PERMISSIONS[key]),
    );
    const values = await Promise.all(keys.map((key) => counters[key]()));
    return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  }

  markSeen(user: AuthenticatedUser, section: SeenSection): Promise<void> {
    return this.seenMarkers.markSeen(user.id, section, new Date());
  }
}
