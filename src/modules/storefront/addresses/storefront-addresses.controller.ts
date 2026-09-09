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
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  createAddressSchema,
  updateAddressSchema,
  type CreateAddressInput,
  type UpdateAddressInput,
} from './storefront-addresses.schemas';
import { StorefrontAddressesService, type AddressView } from './storefront-addresses.service';

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/addresses`. Authenticated, owner-scoped. */
@Controller('storefront/addresses')
export class StorefrontAddressesController {
  constructor(private readonly addresses: StorefrontAddressesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<AddressView[]> {
    return this.addresses.list(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAddressSchema)) body: CreateAddressInput,
  ): Promise<AddressView> {
    return this.addresses.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: UpdateAddressInput,
  ): Promise<AddressView> {
    return this.addresses.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.addresses.remove(user.id, id);
  }
}
