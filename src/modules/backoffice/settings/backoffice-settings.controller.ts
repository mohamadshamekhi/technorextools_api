import { Body, Controller, Get, Put } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeSettingsService } from './backoffice-settings.service';

const putSchema = z.object({
  entries: z
    .array(z.object({ key: z.string().trim().min(1).max(80), value: z.string().max(2000) }))
    .min(1)
    .max(50),
});
type PutInput = z.infer<typeof putSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/settings`. */
@Controller('backoffice/settings')
export class BackofficeSettingsController {
  constructor(private readonly settings: BackofficeSettingsService) {}

  @RequirePermissions('settings.manage')
  @Get()
  list() {
    return this.settings.list();
  }

  @RequirePermissions('settings.manage')
  @Put()
  put(@Body(new ZodValidationPipe(putSchema)) body: PutInput) {
    return this.settings.put(body.entries);
  }
}
