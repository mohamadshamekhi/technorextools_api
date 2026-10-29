# Operations — environment, build, deploy, security

Read this when touching config, CI/Docker, or anything security-sensitive.

## Environment

All config goes through `src/config/env.schema.ts` (Zod-validated at boot, fail fast). Never
read `process.env` elsewhere. Keys: `NODE_ENV`, `PORT`, `API_PREFIX` (`api/v1`),
`DATABASE_URL` (include `serverSelectionTimeoutMS=5000`), `JWT_SECRET` (≥32 chars),
`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `OTP_TTL_SECONDS`, `OTP_RESEND_SECONDS`,
`OTP_MAX_PER_HOUR`, `OTP_MAX_ATTEMPTS`, `OTP_DEV_ECHO` (**must be false in prod** — enforced),
`SMS_PROVIDER` (`console` | `melipayamak`); for `melipayamak`: `MELIPAYAMAK_API_KEY` (preferred —
console.melipayamak.com shared-line API) **or** `MELIPAYAMAK_USERNAME`+`MELIPAYAMAK_PASSWORD`
(legacy REST), plus `MELIPAYAMAK_OTP_PATTERN_ID` (approved pattern, one variable slot for the code),
`REDIS_URL` (optional, `redis://…` / `rediss://…` — enables the shared rate-limiter store),
`API_SERVICE_TOKEN` (optional), `CORS_ORIGIN` (comma-separated),
`PAYMENT_PROVIDER` (`fake` | `zarinpal`), `ZARINPAL_MERCHANT_ID` (required when
`PAYMENT_PROVIDER=zarinpal` — enforced), `ZARINPAL_SANDBOX` (`true`/`false`),
`PAYMENT_CALLBACK_BASE_URL` (public origin the gateway redirects back to —
`${base}/api/v1/payment/callback`), `PAYMENT_RESULT_REDIRECT_URL` (storefront page shown after
payment, gets `?orderNumber=&status=`),
`MELIPAYAMAK_{ORDER_PAID,ORDER_STATUS,ABANDONED_CART}_PATTERN_ID` (optional bodyIds for
transactional SMS — unset → that notification is logged, not sent),
`S3_ENDPOINT` / `S3_REGION` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` /
`S3_PUBLIC_BASE_URL` (all five needed for `POST /backoffice/media/upload`; otherwise it returns 503).
`SEED_SUPERADMIN_MOBILE` is read only by the seed. Keep `.env.example` current; `.env*` is
git-ignored. `RUN_E2E=1` opts the e2e suite in.

### Object storage (ArvanCloud example)

The client sends the raw file to `POST /backoffice/media/upload` (`multipart/form-data`, field
`file`, ≤ 50 MB, plus optional `folder`). The API stores it server-side — it builds a SigV4
**path-style** presigned PUT URL (`s3-presigner.ts`, no SDK) and `fetch`es the bytes to storage
with `x-amz-acl: public-read` — then returns `{ publicUrl, key, size, contentType }`; persist
`publicUrl` on the entity. No browser CORS is involved (the PUT is server→storage).

`image/jpeg` and `image/png` uploads are re-encoded to **WebP** before storage (`image-webp.ts`,
`sharp`, quality 82, EXIF orientation baked in); the stored object, `contentType`, `size` and key
extension all become WebP. A corrupt image → `400`. Other types (WebP, GIF, SVG, PDF, glTF) pass
through untouched. `sharp` is a native dependency — its prebuilt binaries are allow-listed in
`pnpm-workspace.yaml` (`allowBuilds: sharp`); the Docker image (`node:20-slim`) pulls the
`linux-x64` prebuilt binary automatically.

1. Create a bucket (صندوقچه). The upload sends `x-amz-acl: public-read` per object, so the
   bucket's own access level can stay private if preferred.
2. Account → access keys → copy Access Key + Secret Key.
3. No bucket CORS policy is required — the PUT runs server→storage, not from the browser.
4. Env (Tehran region shown):
   ```
   S3_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
   S3_REGION=ir-thr-at1
   S3_BUCKET=<bucket>
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   S3_PUBLIC_BASE_URL=https://<bucket>.s3.ir-thr-at1.arvanstorage.ir
   ```
Server clock must be NTP-synced (SigV4 tolerates ±15 min). Grant `media.manage` to any
non-superadmin role that manages catalog/content. The client PUT may send any `Content-Type`
(only `host` is signed).

## Build & deploy

- **Node 22** — `pnpm@11` refuses to run on Node 20 (`node:sqlite` is 22-only), so the
  Dockerfile base, `.nvmrc` and `engines.node` are all pinned to 22.13+.
- **CI/CD (GitHub Actions, the real pipeline)** — `.github/workflows/ci.yml`:
  `verify` runs `typecheck / lint / format:check / build / test`; `e2e` boots a single-node
  `mongo:7.0` replica set via `supercharge/mongodb-github-action` (service containers can't
  pass `--replSet`), then `pnpm prisma:push && pnpm test:e2e` with `RUN_E2E=1`. Both run on
  every push/PR. `deploy` runs only after `verify` + `e2e` pass **and** the push is to `main`
  (`environment: Technorex`): it SSHes to the server via `appleboy/ssh-action` and runs
  `bash deploy/deploy.sh` (set the `DEPLOY_SEED` repo **variable** to `1` to add `--seed`).
  Required secrets, scoped to the `Technorex` environment: `DEPLOY_SSH_HOST`,
  `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY` (the whole private key), `DEPLOY_PATH`. See
  `deploy/README.md` §5 for setup. There is no longer a GitLab pipeline — `.gitlab-ci.yml`
  was removed when deploy moved here.
- **Local DB** — `docker compose up -d` (`pnpm db:up`) runs the official `mongo:7.0` image with
  `--replSet rs0`; the healthcheck self-initiates the replica set on first start. (The old
  `bitnami/mongodb` image was removed from Docker Hub.) `pnpm db:down` tears it down.
- **Docker** — multi-stage `Dockerfile` (`deps → build → tooling → prod-deps → runtime`), runs
  as the `node` user, `node dist/main` on `:4000`. `.dockerignore` keeps the context lean. The
  `tooling` stage keeps the dev deps so `prisma db push` / `prisma db seed` (ts-node) can run
  as a one-shot container — never deploy it as the server. pnpm is baked into the `base` layer
  (`ARG PNPM_VERSION`, keep it equal to `packageManager`), and `ARG NPM_REGISTRY` points both
  corepack and pnpm at a mirror — set `NPM_REGISTRY` in `.env.production` when the server
  can't reach registry.npmjs.org.
- **e2e tests** self-skip unless `RUN_E2E=1`; they need a reachable `DATABASE_URL`.
- **Production server** — `deploy/` holds the whole recipe: `docker-compose.prod.yml` (api +
  single-node Mongo replica set + Redis on an internal network; only `127.0.0.1:4000` is
  published), `deploy/setup-server.sh` (one-time Ubuntu bootstrap: docker, nginx, certbot, ufw,
  fail2ban, swap), `deploy/deploy.sh` (build + restart, `--seed` to push the schema and seed),
  `deploy/backup-mongo.sh` (nightly `mongodump`), `deploy/nginx/abzar-api.conf` and
  `deploy/env.production.example`. Step-by-step in `deploy/README.md`.
- The app sets **`trust proxy = 1`** (`src/main.ts`) — exactly one nginx hop — so the throttler
  buckets by the real client IP. Adding another proxy (e.g. Cloudflare) means raising it.

## Security

- This service is the trust boundary — re-check auth and ownership on every read and write.
- Verify JWTs server-side; permissions are re-checked per request, never trusted from the token.
- `argon2` hashes OTP codes and refresh tokens; never log codes, tokens, or `DATABASE_URL`.
- OTP: per-mobile hourly cap, resend cooldown, attempt cap with challenge lockout.
- Mutating `/backoffice/*` requests are recorded to `admin_action_logs` by `AdminLogInterceptor`
  (`modules/admin-log`); viewer at `GET /api/v1/backoffice/reports/admin-logs`.
- `GET /api/v1/payment/callback` is `@Public` and trusts nothing: it re-verifies every settlement
  with the provider (`PaymentProvider.verifyPayment`, amount from the order) before marking an
  order paid; `OrdersService.markPaid` is idempotent. `fake` provider is dev/CI only — never set
  `PAYMENT_PROVIDER=fake` in a real environment.
- The in-process sweep (`modules/sweep`) runs on every instance; its operations are idempotent, so
  multiple instances double-work but don't corrupt state. Move to a leader/locked scheduler if that
  overhead matters.
- CORS restricted to `CORS_ORIGIN`; `helmet` on; auth routes rate-limited; 5xx bodies leak nothing.
- `/auth/refresh` rotates the token every call; replaying a rotated token revokes the whole family.
- File uploads go through the API: `POST /backoffice/media/upload` (multipart, ≤ 50 MB) buffers the
  file and PUTs it to object storage server-side with a short-lived SigV4-signed URL scoped to one
  object key. Only `media.manage` holders can call it.
- Structured JSON logs go to stdout/stderr in `production` (`JsonLogger`); pipe to your shipper.
- Treat the OWASP Top 10 as the checklist for any PR touching auth, input handling, or queries.
