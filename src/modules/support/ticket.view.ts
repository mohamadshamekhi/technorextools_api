import type { TicketWithMessages } from './repositories/ticket.repository';

/** Shared ticket → view mapping (same shape for customer and admin surfaces). */
export function toTicketView(t: TicketWithMessages) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    messages: t.messages.map((m) => ({
      senderType: m.senderType,
      senderName: m.senderUser.fullName,
      body: m.body,
      attachmentUrl: m.attachmentUrl,
      createdAt: m.createdAt,
    })),
  };
}
