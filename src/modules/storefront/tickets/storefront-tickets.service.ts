import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketSenderType } from '@prisma/client';
import { TicketRepository, type TicketWithMessages } from '../../support/repositories/ticket.repository';
import { toTicketView } from '../../support/ticket.view';

@Injectable()
export class StorefrontTicketsService {
  constructor(private readonly tickets: TicketRepository) {}

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
    return toTicketView(await this.ownedOrThrow(userId, id));
  }

  async create(userId: string, subject: string, body: string) {
    const ticket = await this.tickets.createWithFirstMessage(userId, subject, body);
    return toTicketView(ticket);
  }

  async reply(userId: string, id: string, body: string, attachmentUrl?: string) {
    const ticket = await this.ownedOrThrow(userId, id);
    if (ticket.status === 'closed') {
      throw new ForbiddenException('این تیکت بسته شده است');
    }
    const updated = await this.tickets.addMessage(id, {
      senderType: TicketSenderType.customer,
      senderUserId: userId,
      body,
      attachmentUrl,
    });
    return toTicketView(updated);
  }

  private async ownedOrThrow(userId: string, id: string): Promise<TicketWithMessages> {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    if (ticket.userId !== userId) throw new ForbiddenException('این تیکت متعلق به شما نیست');
    return ticket;
  }
}
