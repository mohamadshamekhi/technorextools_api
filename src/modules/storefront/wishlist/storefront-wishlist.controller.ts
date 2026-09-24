import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import { StorefrontWishlistService, type WishlistItemView } from './storefront-wishlist.service';

const addSchema = z.object({ productId: z.string().regex(/^[a-f0-9]{24}$/i) });
type AddInput = z.infer<typeof addSchema>;

/** Customer panel — consumed by `abzar/storefront`. Path: `/api/v1/storefront/wishlist`. Authenticated. */
@Controller('storefront/wishlist')
export class StorefrontWishlistController {
  constructor(private readonly wishlist: StorefrontWishlistService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<WishlistItemView[]> {
    return this.wishlist.list(user.id);
  }

  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(addSchema)) body: AddInput,
  ): Promise<{ ok: true }> {
    return this.wishlist.add(user.id, body.productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('productId') productId: string,
  ): Promise<void> {
    await this.wishlist.remove(user.id, productId);
  }
}
