import { Injectable } from '@nestjs/common';
import { Prisma, TicketSenderType, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const withMessages = {
  messages: {
    orderBy: { createdAt: 'asc' },
    include: { senderUser: { select: { fullName: true } } },
  },
} satisfies Prisma.TicketInclude;

export type TicketWithMessages = Prisma.TicketGetPayload<{ include: typeof withMessages }>;

/**
 * All Prisma access for the `tickets` collection. `TicketMessage` child rows are
 * managed here as part of the aggregate.
 */
@Injectable()
export class TicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<TicketWithMessages | null> {
    return this.prisma.ticket.findUnique({ where: { id }, include: withMessages });
  }

  listByUser(userId: string, skip: number, take: number) {
    return Promise.all([
      this.prisma.ticket.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.ticket.count({ where: { userId } }),
    ]);
  }

  paginate(where: Prisma.TicketWhereInput, skip: number, take: number) {
    return Promise.all([
      this.prisma.ticket.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: { user: { select: { fullName: true, mobile: true } } },
      }),
      this.prisma.ticket.count({ where }),
    ]);
  }

  async createWithFirstMessage(
    userId: string,
    subject: string,
    body: string,
  ): Promise<{ ticket: TicketWithMessages; messageId: string }> {
    const created = await this.prisma.ticket.create({
      data: {
        userId,
        subject,
        status: TicketStatus.open,
        messages: {
          create: { senderType: TicketSenderType.customer, senderUserId: userId, body },
        },
      },
      include: withMessages,
    });
    return { ticket: created, messageId: created.messages[0]!.id };
  }

  async addMessage(
    ticketId: string,
    msg: {
      senderType: TicketSenderType;
      senderUserId: string;
      body: string;
    },
  ): Promise<{ ticket: TicketWithMessages; messageId: string }> {
    const nextStatus =
      msg.senderType === TicketSenderType.staff ? TicketStatus.answered : TicketStatus.open;
    const [message] = await this.prisma.$transaction([
      this.prisma.ticketMessage.create({
        data: {
          ticketId,
          senderType: msg.senderType,
          senderUserId: msg.senderUserId,
          body: msg.body,
        },
      }),
      this.prisma.ticket.update({ where: { id: ticketId }, data: { status: nextStatus } }),
    ]);
    const ticket = (await this.findById(ticketId)) as TicketWithMessages;
    return { ticket, messageId: message.id };
  }

  setStatus(id: string, status: TicketStatus): Promise<TicketWithMessages> {
    return this.prisma.ticket.update({ where: { id }, data: { status }, include: withMessages });
  }

  /** Tickets waiting on a staff reply — drives the backoffice sidebar badge. */
  countAwaitingStaff(): Promise<number> {
    return this.prisma.ticket.count({ where: { status: TicketStatus.open } });
  }
}
