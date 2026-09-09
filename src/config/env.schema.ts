import { z } from 'zod';

/**
 * Every environment variable the service reads. Parsed once at boot; a missing or
 * malformed value crashes the process immediately instead of failing at runtime.
 * Nothing outside this module may touch `process.env`.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('api/v1'),

  DATABASE_URL: z.string().url().startsWith('mongodb'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // OTP login
  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  OTP_RESEND_SECONDS: z.coerce.number().int().positive().default(60),
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /// Dev convenience: echo the OTP code in the request response. Never enable in production.
  OTP_DEV_ECHO: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // SMS provider — 'console' just logs; 'melipayamak' sends via MelliPayamak's
  // service-pattern endpoint (BaseServiceNumber). The MELIPAYAMAK_* keys below are
  // required when SMS_PROVIDER=melipayamak (enforced in validateEnv).
  SMS_PROVIDER: z.enum(['console', 'melipayamak']).default('console'),
  MELIPAYAMAK_USERNAME: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  MELIPAYAMAK_PASSWORD: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  /// Numeric id of the approved OTP service pattern (بادی/پترن) — its single variable receives the code.
  MELIPAYAMAK_OTP_PATTERN_ID: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),

  API_SERVICE_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),

  /// Optional. When set, the global rate-limiter stores its counters in Redis
  /// (shared across instances) instead of per-process memory. Leave unset for a
  /// single-instance deployment. Format: redis://[:pass@]host:port[/db] or rediss://…
  REDIS_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined))
    .refine((v) => v === undefined || /^rediss?:\/\//.test(v), {
      message: 'REDIS_URL must start with redis:// or rediss://',
    }),

  // Payment gateway — 'fake' auto-succeeds (dev/CI); 'zarinpal' calls ZarinPal's
  // REST API. ZARINPAL_MERCHANT_ID is required when PAYMENT_PROVIDER=zarinpal
  // (enforced in validateEnv). PAYMENT_CALLBACK_BASE_URL is where the gateway
  // redirects the browser back to — `${base}/api/v1/payment/callback` must be
  // publicly reachable by the user's browser.
  PAYMENT_PROVIDER: z.enum(['fake', 'zarinpal']).default('fake'),
  ZARINPAL_MERCHANT_ID: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  ZARINPAL_SANDBOX: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  PAYMENT_CALLBACK_BASE_URL: z.string().url().default('http://localhost:4000'),
  /// Where to send the browser after payment settles (success or failure), with
  /// `?orderNumber=&status=` appended. Usually the storefront order-result page.
  PAYMENT_RESULT_REDIRECT_URL: z.string().url().default('http://localhost:3000/checkout/result'),

  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.OTP_DEV_ECHO) {
    throw new Error('OTP_DEV_ECHO must be false in production');
  }
  if (parsed.data.PAYMENT_PROVIDER === 'zarinpal' && !parsed.data.ZARINPAL_MERCHANT_ID) {
    throw new Error('PAYMENT_PROVIDER=zarinpal requires: ZARINPAL_MERCHANT_ID');
  }
  if (parsed.data.SMS_PROVIDER === 'melipayamak') {
    const missing = (
      ['MELIPAYAMAK_USERNAME', 'MELIPAYAMAK_PASSWORD', 'MELIPAYAMAK_OTP_PATTERN_ID'] as const
    ).filter((k) => !parsed.data[k]);
    if (missing.length > 0) {
      throw new Error(`SMS_PROVIDER=melipayamak requires: ${missing.join(', ')}`);
    }
  }
  return parsed.data;
}
