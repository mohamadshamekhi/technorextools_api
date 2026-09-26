import type { Media } from '@prisma/client';
import type { TicketWithMessages } from './repositories/ticket.repository';

/** A `TICKET_MESSAGE`-owned media row as the ticket views expose it. */
export interface TicketAttachmentView {
  id: string;
  url: string;
  contentType: string;
  originalName: string | null;
}

/**
 * Shared ticket → view mapping (same shape for customer and admin surfaces).
 * `media` = the `TICKET_MESSAGE` rows of this ticket's messages; attachments are
 * `Media` now, so the old single `attachmentUrl` is gone.
 */
export function toTicketView(t: TicketWithMessages, media: Media[] = []) {
  const byMessage = new Map<string, TicketAttachmentView[]>();
  for (const m of media) {
    if (!m.ownerId) continue;
    const list = byMessage.get(m.ownerId) ?? [];
    list.push({ id: m.id, url: m.url, contentType: m.contentType, originalName: m.originalName });
    byMessage.set(m.ownerId, list);
  }
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messages: t.messages.map((m) => ({
      id: m.id,
      senderType: m.senderType,
      senderName: m.senderUser.fullName,
      body: m.body,
      attachments: byMessage.get(m.id) ?? [],
      createdAt: m.createdAt,
    })),
  };
}
