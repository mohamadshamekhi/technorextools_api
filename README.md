# Abzar API

Backend tier of the Abzar tool-store platform (see the project blueprint) — business logic,
persistence, OTP auth, and dynamic RBAC. Consumed over HTTP by `abzar/storefront` and
`abzar/backoffice`; the only thing that touches the database.

- **NestJS 11** · **Prisma** (MongoDB) · **Zod** · **pnpm**
- Runs on **:4000**; all endpoints under **`/api/v1`** (`/health` unversioned)

## Quick start

```bash
pnpm install
cp .env.example .env            # set JWT_SECRET; OTP_DEV_ECHO=true prints the code
pnpm db:up                      # MongoDB replica set via Docker
pnpm prisma:push                # sync schema to Mongo
pnpm prisma:seed                # permission catalog + roles + superadmin (SEED_SUPERADMIN_MOBILE)
pnpm dev                        # http://localhost:4000

# log in: request an OTP, then verify it (dev echo returns the code)
curl -s localhost:4000/api/v1/auth/otp/request -H 'content-type: application/json' -d '{"mobile":"09120000000"}'
curl -s localhost:4000/api/v1/auth/otp/verify  -H 'content-type: application/json' -d '{"mobile":"09120000000","code":"<devCode>"}'
```

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Watch-mode server |
| `pnpm build` / `pnpm start` | Compile to `dist/` / run the build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, zero warnings |
| `pnpm test` | Jest unit |
| `RUN_E2E=1 pnpm test:e2e` | Jest e2e — self-skips without `RUN_E2E=1`; needs a live Mongo |
| `pnpm prisma:generate` | Regenerate the client after editing `schema.prisma` |
| `pnpm prisma:push` | Apply schema changes (no migrations on Mongo) |
| `pnpm db:up` / `pnpm db:down` | Start / stop local MongoDB |

**Definition of done:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm build &&
pnpm test` pass, Postman + `CLAUDE.md` updated. CI (`.github/workflows/ci.yml`) runs the same.

## Docker

```bash
docker build -t abzar-api .
docker run --rm -p 4000:4000 --env-file .env abzar-api
```

Multi-stage build, runs as a non-root user, `node dist/main` on `:4000`.

## HTTP surface (so far)

All under `/api/v1` except `/health`.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/otp/request` | public | `{ mobile, referralCode? }` → `{ expiresIn, resendAfter, devCode? }` |
| `POST` | `/auth/otp/verify` | public | `{ mobile, code }` → `{ accessToken, expiresIn, refreshToken, isNewUser, user }` |
| `POST` | `/auth/refresh` | public | `{ refreshToken }`, rotates |
| `POST` | `/auth/logout` | bearer | revokes all refresh tokens |
| `GET`  | `/auth/me` | bearer | `{ id, fullName, mobile, email, role, referralCode }` |
| `GET`/`POST`/`PATCH`/`DELETE` | `/backoffice/access/roles`, `.../roles/:id`, `.../permissions` | `roles.manage` | dynamic RBAC management |
| `GET`/`PATCH` | `/backoffice/users`, `/backoffice/users/:id` | `users.view` / `users.manage` | user administration |
| `GET`/`POST`/`PATCH`/`DELETE` | `/backoffice/categories`, `.../tree` | `categories.view` / `categories.manage` | category tree; delete blocked while children/products exist |
| `GET`/`POST`/`PATCH`/`DELETE` | `/backoffice/categories/:categoryId/attribute-groups`, `/backoffice/attribute-groups/:id`, `/backoffice/attribute-groups/:groupId/attributes`, `/backoffice/attributes/:id` | `categories.view` / `categories.manage` | dynamic attribute families |
| `GET`/`POST`/`PATCH`/`DELETE` | `/backoffice/brands`, `/backoffice/brands/:id` | `brands.manage` | brands incl. exclusive-distributor flag |
| `GET`/`POST`/`PATCH`/`DELETE` | `/backoffice/products`, `/backoffice/products/:id` | `products.view` / `products.manage` | products; delete is soft |
| `PUT` | `/backoffice/products/:id/images`, `.../attribute-values`, `.../related` | `products.manage` | replace image set / attribute values / related products |
| `POST`/`PATCH` | `/backoffice/products/:id/variants`, `.../variants/:variantId` | `products.manage` | variant create/update (sku, color, active) |
| `GET`/`PATCH`/`PUT` | `/backoffice/inventory/variants`, `.../variants/:id`, `.../variants/:id/price-tiers` | `inventory.manage` | stock, price override, quantity price tiers |
| `GET` | `/storefront/catalog/categories`, `.../brands` | public | active category tree / brand list |
| `GET` | `/storefront/catalog/products`, `.../products/:slug` | public | product list (category/brand/price/faceted `attrs=` filter, sorting) / product detail |
| `GET`  | `/health` | public | liveness + Mongo ping |

Endpoints split by consumer: admin routes under `/api/v1/backoffice/*`, public storefront
reads under `/api/v1/storefront/catalog/*`, `auth` shared. Authorization is permission-based
(`@RequirePermissions`); `superadmin` bypasses. See [`CLAUDE.md`](./CLAUDE.md).

## Postman

`postman/abzar-api.postman_collection.json` (folders: Auth / Backoffice / Storefront / Health)
+ `postman/abzar-api.postman_environment.json`. Import both, pick *Abzar API — Local*, run
**Auth → Request OTP** then **Verify OTP** (dev echo auto-fills the code). Every new endpoint
is added here in the same change.

See [`CLAUDE.md`](./CLAUDE.md) for the architecture and working contract.
