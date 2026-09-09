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
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import {
  createBrandSchema,
  updateBrandSchema,
  type CreateBrandInput,
  type UpdateBrandInput,
} from './brands.schemas';
import { BrandsService, type BrandView } from './brands.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/brands`. */
@Controller('backoffice/brands')
export class BackofficeBrandsController {
  constructor(private readonly brands: BrandsService) {}

  @RequirePermissions('brands.manage')
  @Get()
  list(): Promise<BrandView[]> {
    return this.brands.list();
  }

  @RequirePermissions('brands.manage')
  @Get(':id')
  getById(@Param('id') id: string): Promise<BrandView> {
    return this.brands.getById(id);
  }

  @RequirePermissions('brands.manage')
  @Post()
  create(
    @Body(new ZodValidationPipe(createBrandSchema)) body: CreateBrandInput,
  ): Promise<BrandView> {
    return this.brands.create(body);
  }

  @RequirePermissions('brands.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) body: UpdateBrandInput,
  ): Promise<BrandView> {
    return this.brands.update(id, body);
  }

  @RequirePermissions('brands.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.brands.delete(id);
  }
}
