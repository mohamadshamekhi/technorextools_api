# Rule: security (this service is the trust boundary)

Apply on every PR touching auth, input handling, queries, or ownership.

- **Re-validate every caller.** The storefront/backoffice BFFs are not trusted. Re-check the
  JWT server-side and re-check resource ownership on every read and write.
- **Permissions from the DB, never the token.** JWT carries only `sub`/`mobile`/`role`.
  `@RequirePermissions` + `PermissionsGuard` resolve the effective set per request.
- **Never log** OTP codes, JWTs, refresh tokens, `argon2` hashes, or `DATABASE_URL`.
- OTP hardening stays intact: per-mobile hourly cap (`OTP_MAX_PER_HOUR`), resend cooldown
  (`OTP_RESEND_SECONDS`), attempt cap (`OTP_MAX_ATTEMPTS`) with challenge lockout.
- `OTP_DEV_ECHO` must be `false` in prod (enforced by env schema) — never return `devCode`
  otherwise.
- Secrets only via `src/config/env.schema.ts`. Never read `process.env` elsewhere. Keep
  `.env.example` current; never commit real secrets.
- `argon2`-hash anything secret at rest (OTP codes, refresh tokens). Refresh tokens rotate on
  use; `logout` revokes all of a user's tokens.
- 5xx responses leak nothing — `AllExceptionsFilter` strips internal detail. Don't add
  error messages that echo query internals or stack data.
- Sensitive admin writes → append to `admin_action_logs` as each admin write lands.
- CORS stays restricted to `CORS_ORIGIN`; `helmet` stays on; auth routes stay rate-limited.
- Treat the OWASP Top 10 as the checklist. Parameterise everything (Prisma does) — never
  build a filter from raw user strings.
