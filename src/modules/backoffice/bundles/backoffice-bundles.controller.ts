import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { BackofficeBundlesService } from './backoffice-bundles.service';

const slug = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ نامعتبر است');

const itemSchema = z.object({
  variantId: z.string().regex(/^[a-f0-9]{24}$/i),
  qty: z.number().int().positive(),
});

const createSchema = z.object({
  title: z.string().trim().min(2).max(200),
  slug,
  description: z.string().trim().max(2000).nullable().default(null),
  bundlePrice: z.number().int().positive(),
  isActive: z.boolean().default(true),
  items: z.array(itemSchema).min(1).max(50),
});
const updateSchema = createSchema.partial();
type CreateInput = z.infer<typeof createSchema>;
type UpdateInput = z.infer<typeof updateSchema>;

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/bundles`. */
@Controller('backoffice/bundles')
export class BackofficeBundlesController {
  constructor(private readonly bundles: BackofficeBundlesService) {}

  @RequirePermissions('bundles.manage')
  @Get()
  list() {
    return this.bundles.list();
  }

  @RequirePermissions('bundles.manage')
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.bundles.getById(id);
  }

  @RequirePermissions('bundles.manage')
  @Post()
  create(@Body(new ZodValidationPipe(createSchema)) body: CreateInput) {
    return this.bundles.create(body);
  }

  @RequirePermissions('bundles.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateInput,
  ) {
    return this.bundles.update(id, body);
  }

  @RequirePermissions('bundles.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.bundles.remove(id);
  }
}
