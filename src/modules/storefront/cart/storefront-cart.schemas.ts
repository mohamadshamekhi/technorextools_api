import { z } from 'zod';

const objectIdSchema = z.string().length(24, 'شناسه باید ۲۴ کاراکتر باشد');
const qtySchema = z.coerce.number().int().min(1, 'تعداد باید حداقل ۱ باشد').max(999, 'تعداد بیش از حد مجاز است');

/** Guest carts carry their token in the `X-Cart-Token` header. */
export const cartTokenSchema = z.string().trim().min(8).max(64);

export const addCartItemSchema = z.object({
  variantId: objectIdSchema,
  qty: qtySchema.default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  qty: qtySchema,
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
