import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketSenderType } from '@prisma/client';
import {
  TicketRepository,
  type TicketWithMessages,
} from '../../support/repositories/ticket.repository';
import { toTicketView } from '../../support/ticket.view';
import { MediaService } from '../../media/media.service';
import { MediaRepository } from '../../media/repositories/media.repository';

@Injectable()
export class StorefrontTicketsService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly media: MediaService,
    private readonly mediaRows: MediaRepository,
  ) {}

  async list(userId: string, skip: number, take: number) {
    const [rows, total] = await this.tickets.listByUser(userId, skip, take);
    return {
      items: rows.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        updatedAt: t.updatedAt,
      })),
      total,
      skip,
      take,
    };
  }

  async detail(userId: string, id: string) {
    return this.view(await this.ownedOrThrow(userId, id));
  }

  async create(userId: string, subject: string, body: string, mediaIds: string[] = []) {
    const { ticket, messageId } = await this.tickets.createWithFirstMessage(userId, subject, body);
    await this.media.attachToOwner(mediaIds, 'TICKET_MESSAGE', messageId, userId);
    return this.view(ticket);
  }

  async reply(userId: string, id: string, body: string, mediaIds: string[] = []) {
    const ticket = await this.ownedOrThrow(userId, id);
    if (ticket.status === 'closed') {
      throw new ForbiddenException('این تیکت بسته شده است');
    }
    const { ticket: updated, messageId } = await this.tickets.addMessage(id, {
      senderType: TicketSenderType.customer,
      senderUserId: userId,
      body,
    });
    await this.media.attachToOwner(mediaIds, 'TICKET_MESSAGE', messageId, userId);
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

  private async ownedOrThrow(userId: string, id: string): Promise<TicketWithMessages> {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    if (ticket.userId !== userId) throw new ForbiddenException('این تیکت متعلق به شما نیست');
    return ticket;
  }
}
