import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeReportsService } from './backoffice-reports.service';

const salesQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .transform((v) => ({
    from: v.from ?? new Date(Date.now() - 30 * 86_400_000),
    to: v.to ?? new Date(),
  }));
type SalesQuery = z.infer<typeof salesQuerySchema>;

const inventoryQuerySchema = z.object({
  threshold: z.coerce.number().int().min(0).default(5),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
});
type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

const logsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(50),
  userId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});
type LogsQuery = z.infer<typeof logsQuerySchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/reports`. */
@Controller('backoffice/reports')
export class BackofficeReportsController {
  constructor(private readonly reports: BackofficeReportsService) {}

  @RequirePermissions('reports.view')
  @Get('sales')
  sales(@Query(new ZodValidationPipe(salesQuerySchema)) query: SalesQuery) {
    return this.reports.sales(query.from, query.to);
  }

  @RequirePermissions('reports.view')
  @Get('inventory')
  inventory(@Query(new ZodValidationPipe(inventoryQuerySchema)) query: InventoryQuery) {
    return this.reports.lowStock(query.threshold, query.skip, query.take);
  }

  @RequirePermissions('reports.view')
  @Get('admin-logs')
  adminLogs(@Query(new ZodValidationPipe(logsQuerySchema)) query: LogsQuery) {
    return this.reports.adminLogs(query);
  }
}
