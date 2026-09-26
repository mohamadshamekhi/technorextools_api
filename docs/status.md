# Status — Phase 1 build

Keep this current as stages land (convention 3 in `CLAUDE.md`).

**Done:** full Prisma schema (all domains) · OTP auth (+ `PATCH /auth/me` self-service profile) ·
dynamic RBAC (`access` module + `PermissionsGuard`) · SMS port · payment port · `/api/v1` prefix +
backoffice/storefront split · seed · error handling · CI · Docker · optional Redis-backed
rate-limiter (`REDIS_URL`) · **catalog** (categories tree + attribute families, brands, products
with URL-based images/attribute-values/related/variants, inventory stock & price tiers, bulk
price update by brand/category/productIds scope (fixed amount or percent, cascades to every
variant's `priceOverride`); storefront public reads with faceted filter) — images are URL-only
for now, no upload infrastructure ·
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
- **payment methods** (`payment-methods/` @Global core) — `Order.paymentMethod` stays a plain
  `online|cash` enum (no FK); `PaymentMethod` is separate admin-managed metadata
  (`code @unique`, `title`, `description`, `isActive`, `sortOrder`) keyed 1:1 by that enum —
  two rows seeded by default, full CRUD via `backoffice/payment-methods`
  (`payment-methods.manage`), but `code` is set only on create (`online`\|`cash`, 409 if that
  code already has a row) and never editable after. Public list: `storefront/payment-methods`.
  Checkout's `paymentMethod` picks a code, rejected (400) if that code has no row or is
  `isActive:false`; `online` opens the single configured `PaymentProvider` gateway, `cash`
  leaves the order
  `pending_payment` for `PATCH backoffice/orders/:orderNumber/confirm-cash-payment` to settle.
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
  `storefront/repairs` create/list/detail; `backoffice/repairs` list (filter by `status`) + status
  transition over the 8-value `RepairStatus` (`received`/`reviewing`/`awaiting_customer`/`awaiting_parts`/`in_progress`/`done`/`delivered`/`canceled`); every repair view carries `statusLabel`,
  an append-only embedded `statusHistory[{ status, statusLabel, at, note, by }]` (back-filled for pre-timeline rows),
  and `POST storefront/repairs/:id/decision` where the customer approves/rejects the quoted `estimatedCost`
  (only from `awaiting_customer`, owner-scoped compare-and-set → `in_progress`/`canceled`),
  plus `technicianNote` / `estimatedCost` set by `PATCH backoffice/repairs/:id`. A status change by an admin
  also writes a `repair_status` notification with `link: /dashboard/repairs/:id`.
- **content admin** — `backoffice/content` articles/branches CRUD + seo upsert; `backoffice/settings`
  (list + bulk PUT).
- **bundles admin** — `backoffice/bundles` CRUD (owns `bundle_items`). Members are validated on write:
  an inactive/soft-deleted member is a 400 (`BUNDLE_ITEM_INACTIVE`), a short-stock member only warns
  (`warnings[]`, `BUNDLE_ITEM_OUT_OF_STOCK`). Admin reads carry `available` / `packagesInStock`. A pack's cover image is a
  `Media` row with `ownerType: BUNDLE` / `purpose: GALLERY` via `POST backoffice/media/upload`; the
  storefront view falls back to the first member's image and exposes `compareAtTotal` / `savingAmount`.
- **spare parts** (`spare-parts/` @Global core, `SparePart` + `SparePartCompatibility`) — separate model, never
  in the product list. `backoffice/spare-parts` CRUD (`spare-parts.manage`; `productIds` on create/update sets
  compatibility), `backoffice/products/:productId/spare-parts` GET/PUT (product-side replace);
  `storefront/spare-parts` list (`productSlug` filter) + `:slug` detail; `POST storefront/cart/spare-parts`.
  Priced/stocked directly (no variants); images = `Media` `ownerType: SPARE_PART`. A spare-part line reserves
  and decrements `SparePart.stockQty`; excluded from product/category discount targets (`categoryId '__spare_part__'`).
- **addresses / wishlist** — `storefront/addresses` CRUD (default handling), `storefront/wishlist`.
- **notifications** (`notifications/` @Global core) — `storefront/notifications` list (owner-scoped) +
  mark-one-read + mark-all-read. Writers: `OrdersService.adminSetStatus` (shipped / delivered /
  cancelled) and `BackofficeDiscountsService` create/update for an active code targeted at specific
  users. No endpoint creates a notification directly.
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

**Also built (second pass):**

- **structured logging** — `JsonLogger` (`common/logging`, dependency-free; JSON lines in
  `production`, pretty otherwise) set in `main.ts`; `HttpLoggerInterceptor` logs one line per request.
- **refresh-token rotation + reuse detection** — `/auth/refresh` rotates and, if an already-rotated
  token is replayed, revokes the whole family. Sweep purges dead `otp_challenges` / `refresh_tokens`
  hourly.
- **MelliPayamak transactional SMS** — `SmsService.sendTemplate(mobile, template, vars)` +
  `MELIPAYAMAK_{ORDER_PAID,ORDER_STATUS,ABANDONED_CART}_PATTERN_ID`; unset pattern → logged not sent.
- **`by_weight` shipping** — `ProductVariant.weightGrams` (nullable); cost = `method.cost` ×
  ceil(total kg), falls back to flat when any line is unweighed.
- **bundles in cart & checkout** — `POST /storefront/cart/bundles`; a bundle line reserves and
  decrements every component variant (`qtyPerPackage × packages`); availability = min component
  packages. Bundles never match product/category discount targets but count toward the cart total.
- **media** — one polymorphic `Media` collection for every uploaded asset (images + documents).
  `POST /api/v1/backoffice/media/upload` (`media.manage`, `multipart/form-data`: `file` ≤ 50 MB +
  optional `ownerType`/`ownerId`/`purpose`/`alt`/`isMain`/`sortOrder`/`folder`). The API buffers the
  file, PUTs it to S3 server-side via a dependency-free SigV4 presigned PUT (`x-amz-acl:
  public-read`), and persists a `Media` row; returns `MediaView`. Also `GET /backoffice/media?
  ownerType&ownerId`, `PATCH /backoffice/media/:id`, `DELETE /backoffice/media/:id` (best-effort S3
  delete). Needs the five `S3_*` env vars (503 if unset or the upstream PUT fails). `ownerType` ∈
  PRODUCT · PRODUCT_VARIANT · BRAND · ARTICLE · CATEGORY · TICKET_MESSAGE · REPAIR_REQUEST;
  `purpose` ∈ GALLERY · COVER · LOGO · DATASHEET · MODEL_3D · EXPLODED_VIEW · ATTACHMENT · OG_IMAGE.
  - Phase 1 wired: product gallery + datasheet + 3D model + exploded-view diagram. The old
    `ProductImage` model and `Product.datasheetUrl`/`model3dUrl` columns are gone; catalog/cart/
    wishlist services stitch images from `MediaRepository` (`@Global`). `PUT
    /backoffice/products/:id/images` removed — manage images via `/backoffice/media/*`.
  - Phase 2 (done): `Brand.logoUrl`, `Article.coverImage`, `SeoMeta.ogImage` and
    `TicketMessage.attachmentUrl` columns are gone; all four are `Media` rows (`purpose` `LOGO` /
    `COVER` / `OG_IMAGE` / `ATTACHMENT`) stitched into the views under their old response names.
    Writing them back through the owning endpoint is now rejected with 400 (`logoUrl` on
    `backoffice/brands`, `coverImage` on `backoffice/content/articles`, `ogImage` on
    `backoffice/content/seo`) instead of being silently dropped; `ownerType=ARTICLE` is accepted by
    `POST backoffice/media/upload` like every other owner type.
    Customers upload attachments through `POST /storefront/media/upload` (auth, image/PDF, ≤ 10 MB,
    stored unattached) and pass `mediaIds[]` (≤ 5) when creating a ticket, a ticket message or a
    repair request; only the uploader's own unattached rows may be attached. Ticket messages and
    repair requests expose `attachments[{ id, url, contentType, originalName }]`.
- **Bulk brand import** — `POST /backoffice/brands/import` (`brands.manage`) upserts crawled brands
  by slug and pulls each logo straight from the source site's URL (`logoSourceUrl`) through
  `MediaService.uploadFromUrl`, which SSRF-guards the URL (`media/remote-fetch.ts`: http/https
  only, public IPs only, every redirect re-checked) before the normal WebP + S3 pipeline. Per-item
  isolation — a bad row or a dead logo URL is reported in `items[]`, never aborts the batch;
  `dryRun` validates without writing. Intended consumer is the crawler, not the admin panel.
- **3D viewer** — a product's `MODEL_3D` `Media` row (glTF/GLB URL) surfaced as `model3dUrl` in the
  storefront product detail and backoffice product detail.
- **Exploded-view diagram** — a product's `EXPLODED_VIEW` `Media` row (image) surfaced as
  `explodedViewUrl` in the storefront product detail and backoffice product detail, same upload
  path as the 3D model/datasheet (`POST /backoffice/media/upload` with `purpose: EXPLODED_VIEW`).
  Numbered part list = embedded `Product.parts` (`ProductPart` composite: `number`, `name`, `code`,
  `sellable`, `hotspot? {x,y}` in 0–100 %), replaced via `PUT /backoffice/products/:id/parts`,
  returned as `parts` (sorted by `number`, `[]` when none) in both product details.

**Product page extras & public forms (third pass):**

- **product extras** — `Product.highlights` and `Product.model3dHotspots` embedded (like `parts`),
  replaced wholesale by `PUT backoffice/products/:id/highlights` / `…/model3d-hotspots`. 3D hotspot
  coordinates are model-space `[x, y, z]`, *not* the percentage coordinates `parts.hotspot` uses.
- **product documents** — own `ProductDocument` model (catalogue / manual / datasheet / certificate)
  wrapping a `Media` row; CRUD under `backoffice/products/:id/documents`. `sizeKb` and `url` come
  from the media row, so a deleted file drops out of the response instead of 404-ing the page.
- **product Q&A** — `ProductQuestion`, moderated like comments: customers ask
  (`POST storefront/catalog/products/:slug/questions`), staff answer via
  `backoffice/product-questions` (`product-questions.moderate`) and answering publishes.
- **public order tracking** — `POST storefront/orders/track { code, mobile }` (throttled, `@Public`),
  matched against the buyer's mobile or the address receiver; returns the order detail plus
  `statusLabel` / `carrier` / `trackingNumber` / `timeline`. `carrier` + `trackingNumber` are set on
  `PATCH backoffice/orders/:orderNumber/status`.
- **contact & newsletter** — `ContactMessage` + `NewsletterSubscriber` with public throttled POSTs
  and backoffice lists (`contact.view`, `newsletter.view`).
- New permission codes: `product-questions.moderate`, `contact.view`, `newsletter.view` →
  re-run `pnpm prisma:seed`.
- **Not built (deferred):** a CMS surface for the marketing copy of the About/FAQ/testimonial pages —
  the storefront still hardcodes those.

**Concurrency (second pass):** order status changes go through an atomic compare-and-set
(`OrderRepository.transition`) — a duplicate gateway callback settles stock/points/loyalty exactly
once, and two admins racing a cancel can't double-restock (the loser gets 409). `POST
/storefront/checkout` holds a 30 s atomic lock on the cart (`Cart.checkoutLockUntil`) so a
double-submit 409s (`details.code = checkout_in_progress`, plus `orderNumber` once it exists) instead
of placing a second order — `GET storefront/checkout/in-flight` reports `{ locked, order }` for polling, and a checkout that fails after the order row
is written is compensated (points refunded, reservation released, order `abandoned`).
*Known residual:* a discount's `maxUsageTotal` is still counted on payment, so two orders paid at the
same moment can exceed it by one.

**Deferred:** live gateway / SMS credentials + real e2e against a gateway · leader-locked scheduler
for multi-instance (current sweep is idempotent but runs on every instance) · replacing `JsonLogger`
with pino once it can be installed · S3 delete of orphaned objects.
