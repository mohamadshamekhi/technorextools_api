import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../../common/decorators/optional-auth.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../auth/token.types';
import {
  addCartItemSchema,
  updateCartItemSchema,
  type AddCartItemInput,
  type UpdateCartItemInput,
} from './storefront-cart.schemas';
import { StorefrontCartService, type CartView } from './storefront-cart.service';

/**
 * Public site — consumed by `abzar/storefront`. Path: `/api/v1/storefront/cart`.
 * Works for guests (send/persist the `X-Cart-Token` header) and signed-in users
 * (Bearer token; the cart is owned by the user). On OTP login the guest cart is
 * merged into the user's cart — see `AuthService.verifyOtp`.
 */
@Controller('storefront/cart')
export class StorefrontCartController {
  constructor(private readonly cart: StorefrontCartService) {}

  private owner(user: AuthenticatedUser | undefined, token: string | undefined) {
    return { user, token: token?.trim() || undefined };
  }

  @OptionalAuth()
  @Get()
  get(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
  ): Promise<CartView> {
    return this.cart.getCart(this.owner(user, token));
  }

  @OptionalAuth()
  @Post('items')
  addItem(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
    @Body(new ZodValidationPipe(addCartItemSchema)) body: AddCartItemInput,
  ): Promise<CartView> {
    return this.cart.addItem(this.owner(user, token), body.variantId, body.qty);
  }

  @OptionalAuth()
  @Patch('items/:itemId')
  updateItem(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
    @Param('itemId') itemId: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: UpdateCartItemInput,
  ): Promise<CartView> {
    return this.cart.updateItem(this.owner(user, token), itemId, body.qty);
  }

  @OptionalAuth()
  @Delete('items/:itemId')
  removeItem(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
    @Param('itemId') itemId: string,
  ): Promise<CartView> {
    return this.cart.removeItem(this.owner(user, token), itemId);
  }

  @OptionalAuth()
  @Delete()
  clear(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
  ): Promise<CartView> {
    return this.cart.clear(this.owner(user, token));
  }
}
