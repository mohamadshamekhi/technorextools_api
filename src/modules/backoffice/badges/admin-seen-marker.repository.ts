import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `admin_seen_markers` collection. */
@Injectable()
export class AdminSeenMarkerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSeenAt(userId: string, section: string): Promise<Date | null> {
    const row = await this.prisma.adminSeenMarker.findUnique({
      where: { userId_section: { userId, section } },
    });
    return row?.seenAt ?? null;
  }

  async markSeen(userId: string, section: string, seenAt: Date): Promise<void> {
    await this.prisma.adminSeenMarker.upsert({
      where: { userId_section: { userId, section } },
      create: { userId, section, seenAt },
      update: { seenAt },
    });
  }
}
