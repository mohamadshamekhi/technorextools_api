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
| Login | OTP: `POST /api/v1/auth/otp/request` → `POST /api/v1/auth/otp/verify` → `{ accessToken, expiresIn, refreshToken, isNewUser, user }`. `otp/verify` also accepts optional `cartToken` — guest cart merged into the user's cart on login |
| `GET /api/v1/auth/me` | `{ id, fullName, mobile, email, role, referralCode }` (`role` = role slug). `PATCH /auth/me` edits `fullName` / `email` only |
| Checkout | `POST /api/v1/storefront/checkout` → `{ orderNumber, total, paymentUrl, paid }` (send the browser to `paymentUrl`). Gateway returns to `GET /api/v1/payment/callback?orderNumber=…` → 302 to `PAYMENT_RESULT_REDIRECT_URL?orderNumber=&status=success\|failed` |
| JWT claims | `sub`, `mobile`, `role` (slug) + `exp`. **Permissions are NOT in the token** — resolved per-request from the DB. |
| Roles | dynamic — rows in `roles`, seeded system roles `superadmin` / `accountant` / `customer`; `superadmin` implicitly holds every permission |
| Error body | `{ statusCode, error, message, fieldErrors?, path, timestamp }` |

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
`orderNumber`/`orderId`, `discountId`/`discountCode`, `shippingMethodId`, `ticketId`, `repairId`,
`bundleId`/`bundleSlug`, `articleId`/`articleSlug`, `branchId`, `warrantySerial`, `commentId`).
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
