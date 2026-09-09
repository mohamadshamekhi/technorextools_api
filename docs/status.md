# Status — Phase 1 build

Keep this current as stages land (convention 3 in `CLAUDE.md`).

**Done:** full Prisma schema (all domains) · OTP auth (+ `PATCH /auth/me` self-service profile) ·
dynamic RBAC (`access` module + `PermissionsGuard`) · SMS port · payment port · `/api/v1` prefix +
backoffice/storefront split · seed · error handling · CI · Docker · optional Redis-backed
rate-limiter (`REDIS_URL`) · **catalog** (categories tree + attribute families, brands, products
with URL-based images/attribute-values/related/variants, inventory stock & price tiers; storefront
public reads with faceted filter) — images are URL-only for now, no upload infrastructure ·
**storefront cart** (guest + user, merge-on-login) ·
**storefront public reads** (all `@Public`): product comments (approved only) · bundles list/detail ·
content (articles, branches, seo-meta, public settings) · shipping methods · warranty serial lookup.

**Commerce (built):**

- **checkout** (`storefront/checkout`) — `POST /quote` (price breakdown) · `POST /` places the order:
  resolves cart lines + reservation-aware stock, applies a discount code, redeems loyalty points
  (≤ 50% of net), computes shipping (flat; `by_weight` treated as flat, `freeOverAmount`), creates
  `Order` `pending_payment`, stamps `reservedUntil` on the cart lines (window = `stock_hold_minutes`),
  opens a payment session · `POST /:orderNumber/pay` retries payment.
- **payment** — provider-agnostic port (`common/payment`), `PAYMENT_PROVIDER` = `fake` (dev/CI,
  auto-succeeds) or `zarinpal` (v4 REST, Rial conversion). `GET /api/v1/payment/callback` is the
  gateway return URL — sits at the API root (2nd exception after `auth`), `@Public`, verifies then
  302-redirects to `PAYMENT_RESULT_REDIRECT_URL?orderNumber=&status=`.
- **orders** (`orders/` @Global core + `OrdersService` lifecycle) — the single place stock, loyalty,
  referral rewards and cart state move on status change. `storefront/orders` (my orders + detail);
  `backoffice/orders` (list/detail/status with guarded transitions; cancel-from-paid restocks +
  refunds points) and `backoffice/payments` (list).
- **discounts** (`discounts/` @Global core + shared `DiscountEvaluatorService`) — code rules: active,
  window, `minOrderAmount`, `maxUsageTotal`/`maxUsagePerUser`, targets (product/category/user);
  usage recorded on *paid*. `storefront/discounts/validate` (auth); `backoffice/discounts` CRUD +
  `/:id/usages`.
- **shipping** — `backoffice/shipping-methods` CRUD (public list already shipped).
- **loyalty** (`loyalty/` @Global core) — points ledger (earn on paid = `total × loyalty_points_per_toman`,
  redeem 1pt=1T, refund on cancel/expire). `storefront/loyalty` (balance/history + `/referrals`);
  `backoffice/loyalty/:userId` (+ manual `/adjust`).
- **referral** (`referral/` @Global core, moved out of `auth`) — reward = `referral_reward_points`
  granted to the referrer on the referred user's first paid order.
- **comments** — `POST /storefront/catalog/products/:slug/comments` (auth, one per user per product,
  `pending`); `backoffice/comments` moderation queue.
- **support / tickets** (`support/` @Global core) — `storefront/tickets` (+ messages),
  `backoffice/tickets` (reply as staff → `answered`, set status).
- **warranty / repairs** (`warranty/` @Global core) — `backoffice/warranties` issue + list-by-order;
  `storefront/repairs` create/list/detail; `backoffice/repairs` list + status.
- **content admin** — `backoffice/content` articles/branches CRUD + seo upsert; `backoffice/settings`
  (list + bulk PUT).
- **bundles admin** — `backoffice/bundles` CRUD (owns `bundle_items`).
- **addresses / wishlist** — `storefront/addresses` CRUD (default handling), `storefront/wishlist`.
- **admin audit** (`admin-log/` @Global) — global interceptor logs mutating `/backoffice/*` requests;
  `backoffice/reports/admin-logs` viewer. `backoffice/reports` also has `sales` and `inventory`.
- **sweep** (`sweep/` — in-process `setInterval`, no external scheduler) — every 60s: expires stale
  `pending_payment` orders (releases reservation, refunds points, `abandoned`); logs abandoned carts
  (`abandoned_cart_hours`) + reminder SMS.

**Reservation model (as built):** cart lines carry `reservedUntil`. Checkout stamps it (TTL =
`stock_hold_minutes`). `available = variant.stockQty − Σ(qty of *other* carts' still-live reservations)`.
Payment success decrements real `stockQty` from the order snapshot and converts the cart; the sweep
job releases lapsed reservations.

**Settings keys** (`site_settings`, defaults in `content/app-settings.service.ts`):
`stock_hold_minutes`(10) · `loyalty_points_per_toman`(0.001) · `loyalty_redeem_max_percent`(50) ·
`referral_reward_points`(5000) · `abandoned_cart_hours`(24) · `site_title`.

**Deferred:** structured logging (pino) · sweep for expired `otp_challenges` / `refresh_tokens` ·
refresh-token rotation · image upload infrastructure (S3/MinIO) · 3D product viewer ·
`by_weight` shipping (needs per-product weight) · bundle lines in the cart/checkout.
