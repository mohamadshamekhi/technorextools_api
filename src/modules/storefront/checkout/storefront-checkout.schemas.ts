import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'شناسه نامعتبر است');

export const startCheckoutSchema = z.object({
  addressId: objectId,
  shippingMethodId: objectId.optional(),
  discountCode: z.string().trim().min(1).max(60).optional(),
  redeemPoints: z.coerce.number().int().min(0).default(0),
  /** `cash` leaves the order `pending_payment` until an admin confirms receipt in the
   *  backoffice. Rejected if the matching `PaymentMethod` row is `isActive: false`. */
  paymentMethod: z.enum(['online', 'cash']).default('online'),
});
export type StartCheckoutInput = z.infer<typeof startCheckoutSchema>;

export const previewCheckoutSchema = startCheckoutSchema.partial({ addressId: true });
export type PreviewCheckoutInput = z.infer<typeof previewCheckoutSchema>;
