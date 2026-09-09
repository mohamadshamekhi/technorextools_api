# Architecture

Read this when working on module structure, the request pipeline, auth, or error handling.
Companion to `CLAUDE.md` (contract + conventions) and `docs/operations.md` (env, deploy, security).

Thin controllers validate input with a Zod pipe and delegate to a service; services hold
business logic and talk only to repositories (convention 5 in `CLAUDE.md`) — never
`PrismaService` directly. The Prisma client is generated to the default location
(`node_modules/@prisma/client`) — do **not** set a custom `output` in the schema, it breaks
`dist/` at runtime.

```text
src/
├── main.ts                       # bootstrap: helmet, CORS, setGlobalPrefix(API_PREFIX) excl. health, shutdown hooks, process-level handlers
├── app.module.ts                 # wires modules + 3 global guards (Throttler → JwtAuth → Permissions) + AllExceptionsFilter
├── config/                       # env.schema.ts (Zod process.env + validateEnv), config.module.ts (@Global)
├── prisma/                       # prisma.service.ts (lifecycle), prisma.module.ts (@Global) — the only place PrismaClient is instantiated
├── common/
│   ├── pipes/zod-validation.pipe.ts       # new ZodValidationPipe(schema) → 400 { message, fieldErrors }
│   ├── sms/                               # SmsService (abstract port) · ConsoleSmsProvider · MelipayamakSmsProvider (OTP via BaseServiceNumber pattern) · SmsModule (@Global, picks by SMS_PROVIDER)
│   ├── redis/redis.module.ts              # @Global; provides REDIS_CLIENT (ioredis | null — null when REDIS_URL unset); quits on shutdown
│   ├── guards/persian-throttler.guard.ts  # global rate-limit guard; Persian 429 message
│   ├── guards/jwt-auth.guard.ts           # global; verifies signature+expiry; @Public() opts out
│   ├── guards/permissions.guard.ts        # global; reads @RequirePermissions(); superadmin bypasses
│   ├── guards/service-token.guard.ts      # opt-in per route; no-op when API_SERVICE_TOKEN is unset
│   ├── decorators/                        # @Public(), @OptionalAuth(), @RequirePermissions(), @CurrentUser()
│   └── filters/all-exceptions.filter.ts   # THE error boundary — see "Error handling"
└── modules/
    ├── access/                  # @Global — identity/RBAC engine
    │   ├── repositories/        #   user.repository.ts · role.repository.ts (+ role_permissions) · permission.repository.ts
    │   ├── permission.catalog.ts#   the canonical permission list + seeded system roles
    │   └── access.service.ts    #   resolveActor(userId) → role + effective permission set, used by JwtStrategy
    ├── auth/                    # SHARED — OTP: otp/request, otp/verify, refresh (rotating), logout, me, PATCH me (profile)
    │   ├── repositories/        #   refresh-token.repository.ts · otp-challenge.repository.ts
    │   ├── otp.service.ts       #   rate-limit + code hash/verify (via OtpChallengeRepository)
    │   ├── auth.service.ts      #   user upsert + tokens (via User/Role/RefreshToken/Referral repositories)
    │   └── jwt.strategy.ts, mobile.util.ts, referral-code.util.ts, auth.schemas.ts
    ├── payment/                 # ROOT — PaymentCallbackController: GET /api/v1/payment/callback (@Public, gateway return → verify → 302 redirect)
    ├── health/                  # SHARED — GET /health — @Public, bounded Mongo ping
    ├── catalog/                 # @Global — catalog domain core (repositories only, no controllers)
    │   └── repositories/        #   category · attribute-group · attribute · brand · product (+ images/attribute-values/related as aggregate children) · product-variant (+ price-tiers)
    ├── cart/                    # @Global — cart domain core: CartRepository (+ CartItem as aggregate child) · cart.pricing.ts (price-tier resolution). Shared by storefront/cart and (later) checkout
    ├── content/                 # @Global — content core: article · branch · seo-meta · site-setting repos + AppSettingsService (typed settings + defaults)
    ├── shipping/                # @Global — shipping core: shipping-method.repository.ts
    ├── bundles/                 # @Global — bundles core: bundle.repository.ts (+ bundle_items as aggregate child)
    ├── warranty/                # @Global — warranty core: warranty.repository.ts + repair-request.repository.ts
    ├── address/                 # @Global — address core: address.repository.ts (customer shipping addresses)
    ├── wishlist/                # @Global — wishlist core: wishlist.repository.ts
    ├── discounts/               # @Global — discounts core: discount (+ discount_targets) · discount-usage repos + DiscountEvaluatorService (shared code rules)
    ├── loyalty/                 # @Global — loyalty core: loyalty-transaction.repository.ts + LoyaltyService (earn/redeem/refund/adjust ledger)
    ├── referral/                # @Global — referral core: referral.repository.ts (moved out of auth; reward granted by OrdersService)
    ├── orders/                  # @Global — orders core: order (+ order_items, order_status_history) · payment repos + OrdersService (lifecycle: stock/loyalty/referral/cart on status change)
    ├── support/                 # @Global — support core: ticket.repository.ts (+ ticket_messages) + ticket.view.ts
    ├── admin-log/               # @Global — admin-action-log.repository.ts + AdminLogInterceptor (APP_INTERCEPTOR; logs mutating /backoffice/* requests)
    ├── sweep/                   # SweepService — in-process setInterval (60s): expire stale pending orders + log abandoned carts
    ├── backoffice/
    │   ├── users/               #   BackofficeUsersController — @RequirePermissions('users.view'/'users.manage'); uses access's UserRepository/RoleRepository
    │   ├── access/              #   BackofficeAccessController — @RequirePermissions('roles.manage'); role CRUD via RoleRepository/PermissionRepository
    │   ├── categories/          #   BackofficeCategoriesController — categories.view/manage; category tree + attribute groups + attributes
    │   ├── brands/              #   BackofficeBrandsController — brands.manage (no `.view` code exists)
    │   ├── products/            #   BackofficeProductsController — products.view/manage; product + images (PUT replace) + attribute-values + related + variant create/update
    │   ├── inventory/           #   BackofficeInventoryController — inventory.manage; variant stock/price + price tiers (deliberately NOT under products.manage)
    │   ├── orders/              #   BackofficeOrdersController (orders.view/manage) + BackofficePaymentsController (payments.view)
    │   ├── shipping/            #   BackofficeShippingController — shipping.manage; shipping-method CRUD
    │   ├── discounts/           #   BackofficeDiscountsController — discounts.view/manage; discount CRUD + /:id/usages
    │   ├── comments/            #   BackofficeCommentsController — comments.moderate; queue + approve/reject
    │   ├── tickets/             #   BackofficeTicketsController — tickets.handle; reply as staff, set status
    │   ├── warranties/          #   BackofficeWarranties + BackofficeRepairs controllers — warranties.manage / repairs.manage
    │   ├── content/             #   BackofficeContentController — articles.manage (+ seo) / branches.manage; article/branch CRUD, seo upsert
    │   ├── settings/            #   BackofficeSettingsController — settings.manage; list + bulk PUT site_settings
    │   ├── bundles/             #   BackofficeBundlesController — bundles.manage; bundle CRUD (owns bundle_items)
    │   ├── loyalty/             #   BackofficeLoyaltyController — loyalty.manage; user summary + manual /adjust
    │   └── reports/             #   BackofficeReportsController — reports.view; sales · inventory (low stock) · admin-logs
    └── storefront/
        ├── catalog/             #   StorefrontCatalogController — @Public reads (categories tree, brands, product list w/ faceted `attrs=`, product detail, approved comments, bundle list+detail) + authenticated POST products/:slug/comments
        ├── content/             #   StorefrontContentController — all @Public; articles list/detail (published only), branches list/detail, seo meta by entity, public site settings (`site_title` + `public_*`)
        ├── shipping/            #   StorefrontShippingController — @Public; active shipping methods
        ├── warranty/            #   StorefrontWarrantyController — @Public; warranty lookup by serial number
        ├── cart/                #   StorefrontCartController — @OptionalAuth (guest via X-Cart-Token, user via Bearer); get/add/update-qty/remove/clear; price-tier pricing + per-line availability; StorefrontCartService.mergeGuestCartIntoUser called from AuthService.verifyOtp
        ├── checkout/            #   StorefrontCheckoutController — authenticated; POST /quote (breakdown), POST / (place order + reserve + open payment), POST /:orderNumber/pay (retry)
        ├── orders/              #   StorefrontOrdersController — authenticated, owner-scoped; my orders list + detail
        ├── addresses/          #   StorefrontAddressesController — authenticated, owner-scoped; address CRUD (default handling)
        ├── wishlist/            #   StorefrontWishlistController — authenticated; list/add/remove
        ├── discounts/           #   StorefrontDiscountsController — authenticated; POST /validate against the caller's cart
        ├── loyalty/             #   StorefrontLoyaltyController — authenticated; balance/history + /referrals
        ├── tickets/             #   StorefrontTicketsController — authenticated, owner-scoped; create + messages
        └── repairs/             #   StorefrontRepairsController — authenticated, owner-scoped; create/list/detail (optional warranty serial)
prisma/
├── schema.prisma  # provider = "mongodb"; ~45 models across 5 domains (identity/access · catalog · cart&order · interaction · content)
└── seed.ts        # permission catalog + system roles + superadmin + site_settings (stock_hold_minutes, loyalty_*, referral_reward_points, abandoned_cart_hours, site_title) + default shipping method — uses PrismaClient directly (outside Nest DI)
prisma.config.ts   # schema path + seed command; loads .env via process.loadEnvFile
postman/           # abzar-api.postman_{collection,environment}.json — folders Auth / Backoffice / Storefront / Health
```

## Auth flow (OTP)

1. `POST /auth/otp/request { mobile, referralCode? }` — `OtpService`: per-mobile rate limit
   (`OTP_MAX_PER_HOUR`), resend cooldown (`OTP_RESEND_SECONDS`), generate a 5-digit code,
   `argon2`-hash it into `otp_challenges` (`OTP_TTL_SECONDS`), send via `SmsService`.
   Response `{ expiresIn, resendAfter, devCode? }` — `devCode` only when `OTP_DEV_ECHO=true`.
2. `POST /auth/otp/verify { mobile, code }` — verify hash, cap attempts (`OTP_MAX_ATTEMPTS`),
   consume the challenge. Upsert the user by mobile (new users get role `customer` + a
   `referralCode`; a passed `referralCode` links a `Referral`). Issue tokens.
3. `AuthService.issueTokens` signs `{ sub, mobile, role }` and stores a **hashed** rotating
   refresh token. `refresh` revokes the presented token and issues a fresh pair.
   `logout` (Bearer, no body) revokes all of the user's refresh tokens.
4. Global `JwtAuthGuard` verifies every request; `JwtStrategy.validate` calls
   `AccessService.resolveActor` to load the live user + **effective permission set** and
   attaches `{ id, mobile, roleId, roleSlug, isSuperadmin, permissions[] }` to `request.user`.

## Authorization (dynamic RBAC)

- Permission codes are defined **once** in `src/modules/access/permission.catalog.ts`
  (`<group>.<action>`). `pnpm prisma:seed` writes exactly these into `permissions`.
- Gate a route with `@RequirePermissions('products.manage', …)` (ALL required). No decorator
  ⇒ any authenticated user. `@Public()` ⇒ no auth.
- `superadmin` (role slug) bypasses every check. Other roles hold only their granted codes.
- Permissions are resolved per-request from the DB (not from the token), so revoking a
  permission takes effect immediately.
- Admins manage roles at `/api/v1/backoffice/access/*`; adding a `permission.catalog.ts`
  entry requires a re-seed.

## Validation

Zod is the single source of truth. Schemas live in `*.schemas.ts` / `token.types.ts` per
module; pipe every body/query/param through `new ZodValidationPipe(schema)`; infer types with
`z.infer`. Never add a `class-validator` DTO. On failure the pipe returns `400` with a
`fieldErrors` map. Validation messages are in Persian (user-facing).

## Error handling

`AllExceptionsFilter` (global `@Catch()`) is the single place an error becomes a response.
Every failure body is `{ statusCode, error, message, fieldErrors?, path, timestamp }`.

| Source | Result |
| --- | --- |
| `HttpException` (Zod pipe 400, guard 401/403, throttler 429, `NotFoundException`, `ConflictException`, …) | passed through with its status + `fieldErrors` |
| Prisma `P2002` / `P2025` / `P2003` | `409` / `404` / `409` |
| Prisma `P2000`,`P2006`,`P2007`,`P2011`,`P2012` | `400` |
| Prisma `P1xxx`, `P2024`, `P2010`-wrapping-a-connection-failure | `503` "Database unavailable" |
| malformed JSON body | `400` |
| anything else | `500`, logged with a stack, **no internal detail in the body** |

Rules for new code:
- Throw Nest's built-in `HttpException` subclasses for expected failures (`throw new
  ForbiddenException(...)`), never `res.status().json()` from a controller.
- Don't catch a Prisma error just to rethrow an HTTP one for the common cases above — the
  filter already maps them. Catch only when you need a *domain-specific* message.
- `DATABASE_URL` carries `serverSelectionTimeoutMS=5000` so a down DB fails fast as a 503
  instead of hanging ~30s.
- `main.ts` logs `unhandledRejection` and exits on `uncaughtException` (let the orchestrator restart).

## Persistence notes (Prisma + MongoDB)

- IDs: `String @id @default(auto()) @map("_id") @db.ObjectId`.
- No migrations — schema changes ship via `prisma db push`. Plan destructive changes by hand.
- `prisma.$transaction` (e.g. `UserRepository.paginate`) needs Mongo running as a **replica
  set**; `docker-compose.yml` provides a single-node one. Money is stored as **integer Toman**.
- Relations are references, not joins — watch `include` depth and N+1.
- `prisma` (CLI) is a **runtime** dependency, not dev — the production image runs
  `prisma generate` via `pnpm install --prod` and can run `prisma db push` on deploy.
