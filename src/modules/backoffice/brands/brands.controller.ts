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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  createBrandSchema,
  importBrandsSchema,
  updateBrandSchema,
  type CreateBrandInput,
  type ImportBrandsInput,
  type UpdateBrandInput,
} from './brands.schemas';
import { BrandsImportService, type ImportBrandsResult } from './brands-import.service';
import { BrandsService, type BrandView } from './brands.service';

/** Admin panel — consumed by `abzar/backoffice`. Path: `/api/v1/backoffice/brands`. */
@Controller('backoffice/brands')
export class BackofficeBrandsController {
  constructor(
    private readonly brands: BrandsService,
    private readonly importer: BrandsImportService,
  ) {}

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

  /** Bulk upsert by slug — the crawler's entry point. */
  @RequirePermissions('brands.manage')
  @Post('import')
  importBrands(
    @Body(new ZodValidationPipe(importBrandsSchema)) body: ImportBrandsInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ImportBrandsResult> {
    return this.importer.import(body, user.id);
  }

  @RequirePermissions('brands.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.brands.delete(id);
  }
}
