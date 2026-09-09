import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

interface HealthReport {
  status: 'ok' | 'degraded';
  uptime: number;
  db: 'up' | 'down';
  timestamp: string;
}

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthReport> {
    let db: 'up' | 'down' = 'up';
    try {
      // Bound the ping so a dead database can't hang the health check.
      await Promise.race([
        this.prisma.$runCommandRaw({ ping: 1 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
    } catch {
      db = 'down';
    }
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      db,
      timestamp: new Date().toISOString(),
    };
  }
}
