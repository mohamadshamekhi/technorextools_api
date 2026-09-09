import { Injectable } from '@nestjs/common';
import type { Branch, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** All Prisma access for the `branches` collection (physical stores). */
@Injectable()
export class BranchRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Branch | null> {
    return this.prisma.branch.findUnique({ where: { id } });
  }

  findMany(): Promise<Branch[]> {
    return this.prisma.branch.findMany({ orderBy: { createdAt: 'asc' } });
  }

  create(data: Prisma.BranchCreateInput): Promise<Branch> {
    return this.prisma.branch.create({ data });
  }

  update(id: string, data: Prisma.BranchUpdateInput): Promise<Branch> {
    return this.prisma.branch.update({ where: { id }, data });
  }

  delete(id: string): Promise<Branch> {
    return this.prisma.branch.delete({ where: { id } });
  }
}
