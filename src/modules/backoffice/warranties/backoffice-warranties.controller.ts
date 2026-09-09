import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RepairStatus } from '@prisma/client';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeWarrantiesService } from './backoffice-warranties.service';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);

const issueSchema = z.object({
  orderId: objectId,
  orderItemId: objectId,
  serialNumber: z.string().trim().min(1).max(120).nullable().default(null),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});
type IssueInput = z.infer<typeof issueSchema>;

const listWarrantiesQuerySchema = z.object({ orderId: objectId });
type ListWarrantiesQuery = z.infer<typeof listWarrantiesQuerySchema>;

const listRepairsQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(RepairStatus).optional(),
});
type ListRepairsQuery = z.infer<typeof listRepairsQuerySchema>;

const setRepairStatusSchema = z.object({ status: z.nativeEnum(RepairStatus) });
type SetRepairStatusInput = z.infer<typeof setRepairStatusSchema>;

/** Admin panel — `abzar/backoffice`. Path: `/api/v1/backoffice/warranties`. */
@Controller('backoffice/warranties')
export class BackofficeWarrantiesController {
  constructor(private readonly warranties: BackofficeWarrantiesService) {}

  @RequirePermissions('warranties.manage')
  @Get()
  list(@Query(new ZodValidationPipe(listWarrantiesQuerySchema)) query: ListWarrantiesQuery) {
    return this.warranties.listForOrder(query.orderId);
  }

  @RequirePermissions('warranties.manage')
  @Post()
  issue(@Body(new ZodValidationPipe(issueSchema)) body: IssueInput) {
    return this.warranties.issue(body);
  }
}

/** Admin panel — `abzar/backoffice`. Path: `/api/v1/backoffice/repairs`. */
@Controller('backoffice/repairs')
export class BackofficeRepairsController {
  constructor(private readonly warranties: BackofficeWarrantiesService) {}

  @RequirePermissions('repairs.manage')
  @Get()
  list(@Query(new ZodValidationPipe(listRepairsQuerySchema)) query: ListRepairsQuery) {
    return this.warranties.listRepairs(query);
  }

  @RequirePermissions('repairs.manage')
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(setRepairStatusSchema)) body: SetRepairStatusInput,
  ) {
    return this.warranties.setRepairStatus(id, body.status);
  }
}
