import { Injectable } from '@nestjs/common';
import type { ContactMessage, ContactMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `contact_messages` collection (public contact form). */
@Injectable()
export class ContactMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ContactMessage | null> {
    return this.prisma.contactMessage.findUnique({ where: { id } });
  }

  create(data: {
    name: string;
    phone: string;
    subject: string | null;
    message: string;
  }): Promise<ContactMessage> {
    return this.prisma.contactMessage.create({ data });
  }

  setStatus(id: string, status: ContactMessageStatus): Promise<ContactMessage> {
    return this.prisma.contactMessage.update({ where: { id }, data: { status } });
  }

  paginate(
    where: Prisma.ContactMessageWhereInput,
    skip: number,
    take: number,
  ): Promise<[ContactMessage[], number]> {
    return Promise.all([
      this.prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.contactMessage.count({ where }),
    ]);
  }
}
