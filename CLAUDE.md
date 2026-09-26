# CLAUDE.md

Guidance for Claude Code working in this repo. This file is the **lean core**: what the
service is, the cross-repo contract, and the non-negotiable conventions. Deeper detail lives
in `docs/` — **read the relevant one before working in that area**:

| Read when… | File |
| --- | --- |
| touching module structure, request pipeline, auth, RBAC, validation, error handling, persistence | `docs/architecture.md` |
| touching env vars, CI/Docker, or security-sensitive code | `docs/operations.md` |
| checking or updating what's built / planned | `docs/status.md` |
| adding or changing any endpoint | `.claude/rules/adding-an-endpoint.md` |
| editing `schema.prisma` or writing a repository | `.claude/rules/prisma-and-data.md` |
| writing a controller/service/module | `.claude/rules/nestjs-style.md` |
| writing or updating tests | `.claude/rules/testing.md` |
| any code touch — self-check before calling it done, auto-fix definition | `.claude/rules/quality-gate.md` |
| anything touching auth, input, queries, ownership | `.claude/rules/security.md` |
| committing, branching, or opening a PR | `.claude/rules/git-and-delivery.md` |
| — token-economy & working rules (auto-loaded) | `.claude/rules/token-economy.md` |

@.claude/rules/token-economy.md

## What this service is

`abzar/api` is the **backend tier** of the Abzar platform: all business logic, persistence,
and authentication. Standalone HTTP API, no UI. Product spec = the blueprint
("بلوپرینت فروشگاه ابزار"), a tool-store platform (public storefront, customer panel, admin
panel, one DB, RBAC). Phase 1 (MVP) is built stage by stage; `docs/status.md` tracks it.

Consumers — both proxy browser traffic here and never touch the DB; this service is the
**JWT issuer** and trust boundary (treat every caller as untrusted, re-validate):

- **`abzar/storefront`** — Next.js 15 frontend + BFF (public site + customer dashboard).
- **`abzar/backoffice`** — admin panel (Next.js, early-stage).

> The storefront repo still carries an older email/password + fixed-role-enum auth client.
> The blueprint (OTP + dynamic RBAC) is the source of truth; don't reintroduce the old model.

### The cross-repo contract

| Concern | Value |
| --- | --- |
| Base URL (dev) | `http://localhost:4000`; all endpoints under **`/api/v1`** (health is `/health`, unversioned) |
| Auth header | `Authorization: Bearer <accessToken>` |
| Service header | `X-Service-Token: <secret>` — verify with `ServiceTokenGuard` where required |
| Cart header | `X-Cart-Token: <sessionToken>` — guest cart identity on `/storefront/cart/*`; client persists the `token` returned in the cart body |
| OTP send failures | `POST auth/otp/request` answers **429** for the hourly cap / resend cooldown and **503** «ارسال پیامک ناموفق بود. لطفاً دوباره تلاش کنید.» when the SMS provider fails. On a 503 the challenge row is **deleted**, so the caller keeps their resend cooldown and hourly quota and may retry at once — a provider outage never locks someone out. The provider's own reason (status **+ response body**) is logged server-side only, with the mobile masked. |
| Login | OTP: `POST /api/v1/auth/otp/request` → `POST /api/v1/auth/otp/verify` → `{ accessToken, expiresIn, refreshToken, isNewUser, user }`. `otp/verify` also accepts optional `cartToken` — guest cart merged into the user's cart on login |
| `GET /api/v1/auth/me` | `{ id, fullName, mobile, email, role, referralCode }` (`role` = role slug). `PATCH /auth/me` edits `fullName` / `email` only |
| Payment methods | `Order.paymentMethod` stays a plain enum (`online`\|`cash`, no FK). `PaymentMethod` (`payment_methods`) is a *separate* admin-managed metadata table keyed 1:1 by that same enum (`code @unique`, `title`, `description`, `isActive`, `sortOrder`) — two rows seeded by default; full CRUD (`GET`/`GET :id`/`POST`/`PATCH`/`DELETE backoffice/payment-methods`, `payment-methods.manage`), but `code` is only settable on create and must be `online`\|`cash` (checkout doesn't know any other code) — create 409s if that code already has a row. Public list: `GET storefront/payment-methods` (active only). `code: online` settles through the single configured `PaymentProvider` gateway (`PAYMENT_PROVIDER`); `code: cash` is settled manually by an admin. `isActive:false` **and** "no row for this code" are both enforced at checkout, not just a panel flag. |
| Checkout | `POST /api/v1/storefront/checkout` body takes `paymentMethod: 'online'\|'cash'` (default `online`; rejected with 400 if that code's `PaymentMethod` row is `isActive:false`) → `{ orderNumber, total, paymentUrl, paid }` (`paymentUrl` is `null` for `cash`; send the browser to it for `online`). Gateway returns to `GET /api/v1/payment/callback?orderNumber=…` → 302 to `PAYMENT_RESULT_REDIRECT_URL?orderNumber=&status=success\|failed`. Cash orders stay `pending_payment` until an admin confirms receipt via `PATCH /api/v1/backoffice/orders/:orderNumber/confirm-cash-payment` (`orders.manage`); `payAgain` (`POST /storefront/checkout/:orderNumber/pay`) is online-only. |
| Bundles (packs) | `GET storefront/catalog/bundles` / `…/bundles/:slug` (`@Public`) → `StorefrontBundleView` = `{ id, title, slug, description, bundlePrice, compareAtTotal, savingAmount, imageUrl, packagesInStock, available, items: [{ qty, variant: { id, sku, colorName, stockQty, effectivePrice, imageUrl, isActive, product: { id, title, slug, isActive } } }] }` (a member's `product.isActive` is already `isActive && deletedAt === null`, so the client needs no second rule). A pack has its **own** cover image — `Media` with `ownerType: BUNDLE`, `purpose: GALLERY` (uploaded via `POST backoffice/media/upload`) — and falls back to its first member's image. A member's `imageUrl` is the variant's own gallery, falling back to the **product's** (most catalogs only fill the product, which is why member images used to be `null`). `compareAtTotal` = Σ `effectivePrice × qty` of the members, `savingAmount` = `compareAtTotal - bundlePrice`, floored at 0. `packagesInStock` = `min(floor(member.stockQty / member.qty))` and `available` = the server's own buyability verdict (pack active + every member variant **and** its product orderable + ≥ 1 pack in stock) — clients read it instead of re-deriving it. All four surfaces (storefront view, cart line, `addBundle` guard, backoffice view) share `bundles/bundle.availability.ts`, so they can't drift. **Admin side:** `GET`/`GET :id backoffice/bundles` return the same `available` / `packagesInStock` plus `items[].stockQty` / `items[].isActive`, so the panel can explain a hidden pack. `POST`/`PATCH backoffice/bundles` reject an inactive (or soft-deleted-product) member with **400** `details.code = BUNDLE_ITEM_INACTIVE` (+ `variantId`, `sku`, `productTitle`; the Persian message names the product and SKU). A member that is merely **out of stock does not block the save** — the response carries `warnings: [{ code: 'BUNDLE_ITEM_OUT_OF_STOCK', variantId, sku, stockQty, requiredQty }]` (always `[]` on reads). Note these two admin codes are UPPER_SNAKE at the frontend's request, unlike the lower_snake `details.code`s elsewhere. Three batched media queries per response, never one per member. `POST storefront/cart/bundles { bundleId, qty }` carries a machine-readable `details.code` on every failure: **404** `bundle_not_found` (missing / `isActive:false` / no items), **409** `bundle_member_inactive` (a member variant is inactive), **409** `bundle_out_of_stock` (+ `details.packagesInStock`, stock can't cover even one pack). Partial stock is **not** an error — `qty` is capped at `min(floor(member.stockQty / member.qty))`. |
| Spare parts | Separate `SparePart` model (not in `storefront/catalog/products`). Compatible with N products via `SparePartCompatibility`. Admin: `backoffice/spare-parts` CRUD (`spare-parts.manage`, `productIds[]` = products it fits) + `GET`/`PUT backoffice/products/:productId/spare-parts` (`{ sparePartIds[] }`, replace). Public: `GET storefront/spare-parts?productSlug=&q=&inStock=&skip=&take=` and `GET storefront/spare-parts/:slug` → `{ id, title, slug, partNumber, shortDesc, description, price, stockQty, weightGrams, isActive, mainImageUrl, images, compatibleProducts[{id,title,slug}] }`. Cart: `POST storefront/cart/spare-parts { sparePartId, qty }`; cart line `kind: 'variant'\|'bundle'\|'spare_part'` + new `sparePartId`. Images via `POST backoffice/media/upload` with `ownerType=SPARE_PART`. Checkout/order items carry `sparePartId`. |
| Exploded-view parts | Embedded `Product.parts` (no own model/repo) — distinct from `SparePart`. `GET storefront/catalog/products/:slug` and backoffice product detail return `parts: [{ number, name, code, sellable, hotspot: { x, y } \| null }]` sorted by `number`, `[]` if none; `hotspot` = % (0–100) position on the `EXPLODED_VIEW` image (`explodedViewUrl`) — the client pins it with `left: x%` / `top: y%` / `translate(-50%, -50%)`; `hotspot: null` = table-only row, no pin; `sellable: false` = informational part, no buy button. Admin: `PUT backoffice/products/:id/parts { parts[] }` (`products.manage`, full replace, duplicate `number` → 400) → `ProductDetail`. |
| Product extras (PDP) | Beyond `parts`, a product detail carries: `highlights: [{ icon, value, label }]` (icon-card strip, embedded on `Product`, `PUT backoffice/products/:id/highlights`), `model3dHotspots: [{ id, label, description, position: [x, y, z] }]` (points on the glTF model — **model-space coordinates, not percentages** unlike `parts.hotspot`; embedded, `PUT backoffice/products/:id/model3d-hotspots`, `key` unique per product) and `documents: [{ id, type, title, url, sizeKb, locale, updatedAt }]` (`type` ∈ `catalog\|manual\|datasheet\|certificate`; own `ProductDocument` model wrapping a `Media` row — `GET`/`POST backoffice/products/:id/documents`, `PATCH`/`DELETE …/documents/:documentId`, `products.manage`). A document whose media row was deleted is dropped from the response. |
| Product Q&A | `ProductQuestion` (moderated like `Comment`). Public: `GET storefront/catalog/products/:slug/questions` → `[{ id, question, answer, askedAt, answeredAt }]` (approved only; the same array is inlined as `questions` in the product detail). Authenticated: `POST storefront/catalog/products/:slug/questions { question }` → `{ status: 'pending' }`. Admin (`product-questions.moderate`): `GET backoffice/product-questions?status=`, `POST backoffice/product-questions/:id/answer { answer }` (answering approves + publishes in one write), `PATCH backoffice/product-questions/:id { status: approved\|rejected }`. |
| Customer order items | Each line of `GET storefront/orders/:orderNumber` (and of the public tracking view, which wraps the same detail) is `{ kind: 'variant'\|'bundle'\|'spare_part', productTitle, productSlug, sku, imageUrl, qty, unitPrice, lineTotal }`. `productTitle`/`sku` stay the **snapshot** taken at checkout; `productSlug` and `imageUrl` are resolved live from the catalog, so both are `null` when the entity is gone. `imageUrl` is the variant's own main gallery image, falling back to the product's — a bundle is always `null` (`MediaOwnerType` has no `BUNDLE`). `kind` tells the client which base path to link to. Resolved with one `MediaRepository.findByOwners` per owner type for the whole order, never per line. |
| Public order tracking | `POST storefront/orders/track { code, mobile }` — `@Public`, throttled to 10/min. The mobile must match the buyer's account **or** the order address's `receiverMobile`; any mismatch is a 404 (never "wrong mobile"). Returns the full customer order detail plus `statusLabel`, `carrier`, `trackingNumber` and `timeline: [{ key, label, date \| null }]` (stages `pending_payment → paid → processing → shipped → delivered`, or `… → cancelled`). `Order.carrier` / `Order.trackingNumber` are set by the admin through the optional `carrier` / `trackingNumber` fields on `PATCH backoffice/orders/:orderNumber/status`. |
| Contact & newsletter | `POST storefront/contact { name, phone, subject?, message }` → 201 `{ id }` (`@Public`, 5/min) — rows land in `contact_messages`, listed via `GET backoffice/contact-messages` + `PATCH backoffice/contact-messages/:id { status: new\|handled }` (`contact.view`). `POST storefront/newsletter { contact }` accepts an email **or** an Iranian mobile → 201 `{ created: true }` for a new contact, 200 `{ created: false }` if already subscribed (idempotent; emails lower-cased, mobiles stored as `09…`). Admin list: `GET backoffice/newsletter` (`newsletter.view`). |
| Notifications | `GET storefront/notifications` → `[{ id, type, title, body, link, createdAt, read }]`, `type` ∈ `order_shipped\|order_delivered\|order_cancelled\|repair_status\|discount\|system` (icon/color are frontend-only, mapped from `type`). `link` is an optional in-app path the client navigates to on tap (e.g. `/dashboard/repairs/:id`) or `null`. **The consumers parse `type` as a strict enum — adding a value to `NotificationType` is a breaking change: announce it to the frontend before shipping it.** `PATCH storefront/notifications/:id/read` → 204 (owner-scoped, 404 if not the caller's). `POST storefront/notifications/read-all` → 204. Rows are written by other domains via `NotificationRepository` (`notifications/`, `@Global`): order status changes to `shipped`/`delivered`/`cancelled` (admin transition), a repair-request status change by an admin (`repair_status`, with `link` to the request) and a new/updated **active** discount that targets specific users (`discount`). No endpoint creates them directly. |
| Customer dashboard stats | `GET storefront/orders/stats` → `{ totalSpend, paidOrderCount, monthlyTrend: [{ month: 'YYYY-MM', count, amount }] }` — lifetime spend + zero-filled trailing-6-month trend; "paid" = `paid\|processing\|shipped\|delivered`. `GET storefront/loyalty` now also returns `tier: { lifetimePoints, tier: { key, title, minPoints }, nextTier \| null, pointsToNextTier \| null, progressPercent }` alongside the existing `balance`/`transactions` — tiers are **hardcoded** thresholds on lifetime *earned* points (redemptions don't lower tier): bronze 0 / silver 500 / gold 2000 / platinum 5000. `GET storefront/discounts/active` → `ActiveDiscountView[] { code, amountType, value, minOrderAmount, endsAt }` — discounts targeted at this user, or public codes with no targets at all, that are active/in-window/not-exhausted; product/category-only-targeted codes are excluded (not "for" the customer). |
| Repair requests | `RepairStatus` has **8** values: `received` · `reviewing` · `awaiting_customer` · `awaiting_parts` · `in_progress` · `done` (آماده تحویل) · `delivered` · `canceled` (one `l`, unlike `OrderStatus.cancelled`). Admin: `GET backoffice/repairs?status=&skip=&take=` → `{ items, total, skip, take }`, item = `{ id, issueDescription, status, statusLabel, statusHistory, technicianNote, estimatedCost, user: { name, mobile }, warranty: { serialNumber, orderId } | null, attachments: [{ id, url, contentType, originalName }], createdAt, updatedAt }`. `statusHistory: [{ status, statusLabel, at, note, by }]` is an **append-only embedded timeline**, oldest first (`by` ∈ `admin`\|`customer`\|`system`; entries written before the field existed read as `admin`) — clients render it instead of inferring progress from the enum's ordering; rows created before it existed get a synthetic `received`@`createdAt` (+ current status @`updatedAt`) entry, so it is never empty. `technicianNote` (string\|null) and `estimatedCost` (integer Toman\|null) are the technician's findings, visible to the customer. `PATCH backoffice/repairs/:id/status { status, note? }` (`repairs.manage`) appends the timeline entry (carrying `note`) and writes a `repair_status` notification with `link: /dashboard/repairs/:id`; re-sending the current status with no `note` is a no-op (no entry, no notification). `PATCH backoffice/repairs/:id { technicianNote?, estimatedCost? }` (`repairs.manage`, at least one field) sets the findings only — it never touches the status, the timeline or notifications. Customer views (`storefront/repairs`) carry `warrantySerial` instead of `user`/`warranty`. The customer answers a quote with `POST storefront/repairs/:id/decision { decision: 'approve'\|'reject', note? }` (authenticated, owner-scoped, 10/min): allowed **only** while `status === awaiting_customer` **and** `estimatedCost !== null`; `approve` → `in_progress`, `reject` → `canceled`, appending a `by: 'customer'` timeline entry with that `note`. Someone else's (or a missing) request is **404, never 403** — existence isn't leaked; a wrong status, a missing quote or a lost compare-and-set race is **409**. The transition is an owner-scoped `updateMany` compare-and-set, so a double tap appends one entry. `statusLabel` is the Persian label resolved server-side (`warranty/repair.view.ts`) — clients render it instead of keeping their own map. There is **no** `trackingCode` on a repair request; the `id` is the identifier. |
| Attachments (tickets / repairs) | Customers upload with `POST /api/v1/storefront/media/upload` (authenticated, `multipart/form-data`: `file` — JPEG/PNG/WebP or PDF, ≤ 10 MB — plus optional `alt`) → `MediaView`. The row is stored **unattached**; its `id` is then passed as `mediaIds[]` (≤ 5) on `POST storefront/tickets`, `POST storefront/tickets/:id/messages`, `POST backoffice/tickets/:id/messages` and `POST storefront/repairs`. Only the uploader's own still-unattached rows are accepted (400 otherwise). `TicketMessage.attachmentUrl` is gone — each message now carries `attachments[{ id, url, contentType, originalName }]` (and its `id`); repair views carry the same `attachments[]`. |
| Bulk brand import (crawler) | `POST /api/v1/backoffice/brands/import` (`brands.manage`) — upsert-by-slug for a crawler. Body: `{ source?, dryRun?, replaceLogo?, brands: [{ title, slug?, isExclusiveDistributor?, authenticityNote?, logoSourceUrl? }] }` (≤ ۲۰۰ items). `slug` is derived from a latin `title` when omitted; a non-latin title with no `slug` fails **that item only**. `logoSourceUrl` is the *source site's* image URL — the API downloads it (SSRF-guarded: http/https + public IP only, ≤ 3 redirects, 15 s) and stores it as a `Media` row (`BRAND`/`LOGO`); an existing logo is kept unless `replaceLogo: true`. Fields the payload omits never clear an admin's manual edit. Response: `{ dryRun, total, created, updated, unchanged, failed, items: [{ title, slug, status: created\|updated\|unchanged\|failed, brandId, logo: uploaded\|skipped\|failed\|none, error }] }` — always 201; per-item failures live in `items[]`, they never fail the batch. |
| Brand / article / SEO images | `Brand.logoUrl`, `Article.coverImage` and `SeoMeta.ogImage` columns are gone — they're `Media` rows (`ownerType` `BRAND`/`ARTICLE`/…, `purpose` `LOGO`/`COVER`/`OG_IMAGE`) uploaded via `POST backoffice/media/upload`. The **response** fields keep their names (read from `Media`); sending them to `POST/PATCH backoffice/brands`, `backoffice/content/articles` or `backoffice/content/seo` is **rejected with 400** (`fieldErrors.coverImage` / `fieldErrors.ogImage`) rather than silently ignored. Every `MediaOwnerType` value — including `ARTICLE` — is accepted by `POST backoffice/media/upload`; an owner id that doesn't exist → 400. `GET storefront/content/seo/:entityType/:entityId` resolves `ogImage` only for `article`/`product`/`category`/`brand`. |
| Checkout concurrency | One checkout per cart at a time: `POST /storefront/checkout` takes an atomic cart-level lock (30 s) — a double-submit gets 409 with `details: { code: 'checkout_in_progress', orderNumber \| null }` (null while the first submit hasn't written its order yet); an already-pending order gives `details.code = 'pending_order_exists'`. `GET storefront/checkout/in-flight` → `{ locked, order: { orderNumber, status, total, paymentMethod, expiresAt } \| null }` so the client polls the real state instead of a timer. A half-failed checkout is compensated (points refunded, reservation released, order `abandoned`). Order status flips are compare-and-set, so a duplicate gateway callback settles stock/points once; a racing admin status change gets 409. |
| JWT claims | `sub`, `mobile`, `role` (slug) + `exp`. **Permissions are NOT in the token** — resolved per-request from the DB. |
| Roles | dynamic — rows in `roles`, seeded system roles `superadmin` / `accountant` / `customer`; `superadmin` implicitly holds every permission |
| Error body | `{ statusCode, error, message, fieldErrors?, details?, path, timestamp }` — `details` is optional machine-readable context on some 4xx (e.g. checkout's `{ code, orderNumber }`); previously extra keys thrown with a `ConflictException` were dropped by the filter and never reached the client. |

## Conventions (non-negotiable)

### 1. Split every endpoint by consumer

All routes under `/api/v1` (`API_PREFIX`); `/health` excluded.

| Consumer | Module path | URL | Guard baseline |
| --- | --- | --- | --- |
| `abzar/backoffice` | `src/modules/backoffice/<domain>/` | `/api/v1/backoffice/<domain>` | `@RequirePermissions('<code>')` on every route |
| `abzar/storefront` | `src/modules/storefront/<domain>/` | `/api/v1/storefront/<domain>` | authenticated; owner-scoped (public reads use `@Public()`) |
| Shared / root | `src/modules/<domain>/` | `/api/v1/<domain>` | per-route — only `auth` and `payment` |

- Routes serving guests **and** signed-in users (e.g. cart) use `@OptionalAuth()`: JWT guard
  runs but tolerates a missing/invalid token (`request.user` undefined); guests identified by
  `X-Cart-Token`.
- Name controllers/modules `Backoffice<Domain>*` / `Storefront<Domain>*`.
- A domain needed by both apps gets **two controllers** (one per folder) over a **shared
  service** — admin and public surfaces diverge in fields, filters, authorization.
- `auth` and `payment` are the only route groups shared at the root of `/api/v1`
  (`payment` = the gateway return URL `GET /api/v1/payment/callback`, `@Public`, no consumer scope).
  `health` is the sole unversioned route.

### 2. Every endpoint gets a Postman request — same change

`postman/abzar-api.postman_collection.json` is a maintained deliverable. On add/change:

- add/update the request under the matching folder (**Auth / Backoffice / Storefront / Health**),
- realistic example body + `{{baseUrl}}` / `{{accessToken}}` / `{{userId}}` variables,
- a test script capturing anything reusable (ids, tokens),
- description names the Zod schema and the response shape.

`postman/abzar-api.postman_environment.json` holds `baseUrl`, `apiBase`, `mobile`, `otpCode`,
`serviceToken`, `accessToken`, `refreshToken`, `userId`, `roleId`, `customerRoleId`, plus
resource ids captured by request test scripts (`productId`/`productSlug`, `addressId`,
`orderNumber`/`orderId`, `discountId`/`discountCode`, `shippingMethodId`,
`paymentMethodId`/`paymentMethodIdCash`, `ticketId`, `repairId`,
`bundleId`/`bundleSlug`, `sparePartId`/`sparePartSlug`, `articleId`/`articleSlug`, `branchId`, `warrantySerial`, `commentId`,
`mediaId`).
**Request OTP** saves `otpCode` from `devCode`; **Verify OTP** saves the tokens. Validate the
JSON parses before committing.

### 3. These docs are living documents

In the **same change**, update `CLAUDE.md` (contract/conventions) or the matching `docs/`
file whenever you: add a module or endpoint group, change the cross-repo contract, add an env
var, change the build/test workflow, or make an architectural decision. `docs/status.md`
tracks build progress. Goal: these files alone brief a new contributor.

### 4. Ask before guessing

Ambiguous request — contract shape, which consumer owns a domain, a schema field, a role
boundary — **ask**. Don't infer and proceed.

### 5. One repository per model — controller → service → repository → Prisma

Every Prisma model gets its own `<module>/repositories/<model>.repository.ts` — an
`@Injectable` that is the **only** caller of `this.prisma.<model>` for that collection.
Services never inject `PrismaService`; they inject repositories and hold the business logic
(validation beyond Zod, cross-repo orchestration, transactions). Applies even to simple
lookup models.

- A model owned by one domain lives in that module; a model read by several lives in the
  module that owns it conceptually (`access` for `User`) and is exported from a `@Global`
  module.
- **Child/junction rows of an aggregate** (`RolePermission` under `Role`, `CartItem` under
  `Cart`) are managed by the aggregate's repository — no repo of their own.
- Repositories return Prisma types (or thin `X & { relation }` aliases) — no `View`/DTO
  mapping there; `toView()` stays in the service.
- **Exception:** `prisma/seed.ts` uses `PrismaClient` directly (standalone script, outside DI).
- Reference: `src/modules/access/repositories/*` and `src/modules/auth/repositories/*`.

### 6. Flag every frontend-facing change, every time

Any change that `abzar/storefront` or `abzar/backoffice` must react to — a new/changed field
in a response, a new enum value, a new required/optional request field, a changed URL/route,
a changed error shape, a new header, a behavior change in an existing endpoint — **must** be
called out explicitly at the end of the response, in Persian, addressed to the frontend:
what changed, on which endpoint/field, and what the frontend needs to do about it (or that
nothing is required if the change is additive and backward-compatible but still worth knowing
about). Don't rely on the Postman/CLAUDE.md diff alone to carry this — say it out loud even
for a one-field addition. Silence here is treated as "no frontend impact," so never skip it
when there is one.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | NestJS 11 — modules, DI, guards, a Zod validation pipe |
| ORM / DB | Prisma 6 + **MongoDB** connector (~45 models) |
| Auth | OTP login (mobile + 5-digit code, `argon2`-hashed); `@nestjs/jwt` + `passport-jwt` |
| Authorization | dynamic RBAC — `roles` / `permissions` / `role_permissions`; `@RequirePermissions` + global `PermissionsGuard` |
| SMS | provider-agnostic `SmsService` port; `ConsoleSmsProvider` (dev) / `MelipayamakSmsProvider` — by `SMS_PROVIDER` |
| Payments | provider-agnostic `PaymentProvider` port (`common/payment`); `FakePaymentProvider` (dev/CI) / `ZarinpalPaymentProvider` — by `PAYMENT_PROVIDER` |
| Scheduling | in-process `setInterval` sweep (`modules/sweep`) — no external scheduler / `@nestjs/schedule` |
| Logging | `JsonLogger` (`common/logging`, dependency-free) — JSON lines in `production`, Nest pretty logger otherwise; `HttpLoggerInterceptor` per-request |
| File storage | S3-compatible object storage; client sends the file to `POST /backoffice/media/upload` (multipart, ≤ 50 MB), API stores it server-side via a dependency-free SigV4 presigned PUT (`modules/media`, `s3-presigner.ts`) and persists a `Media` row. JPEG/PNG are re-encoded to WebP first (`image-webp.ts`, `sharp`; corrupt image → 400); other types pass through. The multipart filename is latin-1-decoded by busboy, so it is repaired with `decodeMultipartFilename` (`multipart-filename.ts`) before being stored — `originalName` is always the real UTF-8 name, never mojibake. `Media` is polymorphic (`ownerType` + `ownerId` + `purpose`) — product images/datasheets/3D models, **bundle covers (`BUNDLE`)**, brand logos, article covers, ticket attachments are all `Media`; consuming services stitch them in via `MediaRepository` (`@Global`). No `ProductImage` model. |
| Validation | Zod at every boundary (`ZodValidationPipe`) — no DTO classes, no `class-validator` |
| Rate limiting | `@nestjs/throttler` (global 120/min; tighter on auth); OTP has its own per-mobile limits. In-memory by default; `REDIS_URL` shares counters across instances |
| Package manager | pnpm 11 — build-script allowlist in `pnpm-workspace.yaml` |

## Commands

```bash
pnpm dev                 # watch-mode server on :4000
pnpm build               # nest build → dist/
pnpm start               # node dist/main
pnpm typecheck           # tsc --noEmit (strict, noUncheckedIndexedAccess, noImplicitOverride)
pnpm lint                # eslint, --max-warnings 0
pnpm format[:check]      # prettier

pnpm db:up / db:down     # local MongoDB replica set via docker-compose
pnpm prisma:push         # sync schema.prisma → Mongo (NO migrations on the Mongo connector)
pnpm prisma:generate     # regenerate the client — run after every schema edit
pnpm prisma:seed         # permission catalog + system roles + superadmin (SEED_SUPERADMIN_MOBILE) + settings

pnpm test                # jest unit (*.spec.ts next to source)
pnpm test path/to/x.spec.ts        # single file
pnpm test -t "issues a token"      # single test by name
RUN_E2E=1 pnpm test:e2e # jest test/*.e2e-spec.ts — self-skips unless RUN_E2E=1 (needs a live DB)
```

**Definition of done:**

1. `pnpm typecheck && pnpm lint && pnpm build && pnpm test` all pass.
2. New/changed endpoints have Postman requests in `postman/abzar-api.postman_collection.json`.
3. `CLAUDE.md` / `docs/` reflect any structural or contract change.
4. After editing `prisma/schema.prisma`: `pnpm prisma:generate` (and `pnpm prisma:push` against a running DB).
