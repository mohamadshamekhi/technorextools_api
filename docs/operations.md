# Operations — environment, build, deploy, security

Read this when touching config, CI/Docker, or anything security-sensitive.

## Environment

All config goes through `src/config/env.schema.ts` (Zod-validated at boot, fail fast). Never
read `process.env` elsewhere. Keys: `NODE_ENV`, `PORT`, `API_PREFIX` (`api/v1`),
`DATABASE_URL` (include `serverSelectionTimeoutMS=5000`), `JWT_SECRET` (≥32 chars),
`JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `OTP_TTL_SECONDS`, `OTP_RESEND_SECONDS`,
`OTP_MAX_PER_HOUR`, `OTP_MAX_ATTEMPTS`, `OTP_DEV_ECHO` (**must be false in prod** — enforced),
`SMS_PROVIDER` (`console` | `melipayamak`), `MELIPAYAMAK_USERNAME` / `MELIPAYAMAK_PASSWORD` /
`MELIPAYAMAK_OTP_PATTERN_ID` (all required when `SMS_PROVIDER=melipayamak` — OTP pattern must
have one variable slot for the code), `REDIS_URL` (optional, `redis://…` / `rediss://…` — enables the shared rate-limiter store),
`API_SERVICE_TOKEN` (optional), `CORS_ORIGIN` (comma-separated),
`PAYMENT_PROVIDER` (`fake` | `zarinpal`), `ZARINPAL_MERCHANT_ID` (required when
`PAYMENT_PROVIDER=zarinpal` — enforced), `ZARINPAL_SANDBOX` (`true`/`false`),
`PAYMENT_CALLBACK_BASE_URL` (public origin the gateway redirects back to —
`${base}/api/v1/payment/callback`), `PAYMENT_RESULT_REDIRECT_URL` (storefront page shown after
payment, gets `?orderNumber=&status=`).
`SEED_SUPERADMIN_MOBILE` is read only by the seed. Keep `.env.example` current; `.env*` is
git-ignored. `RUN_E2E=1` opts the e2e suite in.

## Build & deploy

- **CI** — `.github/workflows/ci.yml`: `verify` job runs `typecheck / lint / format:check /
  build / test`; `e2e` job spins up a Mongo replica-set service and runs `pnpm test:e2e`
  with `RUN_E2E=1`.
- **Docker** — multi-stage `Dockerfile` (`deps → build → prod-deps → runtime`), runs as the
  `node` user, `node dist/main` on `:4000`. `.dockerignore` keeps the context lean.
- **e2e tests** self-skip unless `RUN_E2E=1`; they need a reachable `DATABASE_URL`.

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
- Treat the OWASP Top 10 as the checklist for any PR touching auth, input handling, or queries.
