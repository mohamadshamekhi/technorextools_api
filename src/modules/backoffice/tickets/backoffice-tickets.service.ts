import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketSenderType, type TicketStatus } from '@prisma/client';
import {
  TicketRepository,
  type TicketWithMessages,
} from '../../support/repositories/ticket.repository';
import { MediaService } from '../../media/media.service';
import { MediaRepository } from '../../media/repositories/media.repository';
import { toTicketView } from '../../support/ticket.view';

@Injectable()
export class BackofficeTicketsService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly media: MediaService,
    private readonly mediaRows: MediaRepository,
  ) {}

  async list(query: { skip: number; take: number; status?: TicketStatus }) {
    const [rows, total] = await this.tickets.paginate(
      query.status ? { status: query.status } : {},
      query.skip,
      query.take,
    );
    return {
      items: rows.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        user: { name: t.user.fullName, mobile: t.user.mobile },
        updatedAt: t.updatedAt,
      })),
      total,
      skip: query.skip,
      take: query.take,
    };
  }

  async detail(id: string) {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    return this.view(ticket);
  }

  async reply(staffUserId: string, id: string, body: string, mediaIds: string[] = []) {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    const { ticket: updated, messageId } = await this.tickets.addMessage(id, {
      senderType: TicketSenderType.staff,
      senderUserId: staffUserId,
      body,
    });
    await this.media.attachToOwner(mediaIds, 'TICKET_MESSAGE', messageId, staffUserId);
    return this.view(updated);
  }

  async setStatus(id: string, status: TicketStatus) {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    const updated = await this.tickets.setStatus(id, status);
    return this.view(updated);
  }

  /** Stitch each message's `TICKET_MESSAGE` media rows into the view. */
  private async view(ticket: TicketWithMessages) {
    const rows = await this.mediaRows.findByOwners(
      'TICKET_MESSAGE',
      ticket.messages.map((m) => m.id),
    );
    return toTicketView(ticket, rows);
  }
}
