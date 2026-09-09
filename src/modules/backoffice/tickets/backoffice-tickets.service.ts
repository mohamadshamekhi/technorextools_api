import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketSenderType, type TicketStatus } from '@prisma/client';
import { TicketRepository } from '../../support/repositories/ticket.repository';
import { toTicketView } from '../../support/ticket.view';

@Injectable()
export class BackofficeTicketsService {
  constructor(private readonly tickets: TicketRepository) {}

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
    return toTicketView(ticket);
  }

  async reply(staffUserId: string, id: string, body: string, attachmentUrl?: string) {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    const updated = await this.tickets.addMessage(id, {
      senderType: TicketSenderType.staff,
      senderUserId: staffUserId,
      body,
      attachmentUrl,
    });
    return toTicketView(updated);
  }

  async setStatus(id: string, status: TicketStatus) {
    const ticket = await this.tickets.findById(id);
    if (!ticket) throw new NotFoundException('تیکت یافت نشد');
    const updated = await this.tickets.setStatus(id, status);
    return toTicketView(updated);
  }
}
