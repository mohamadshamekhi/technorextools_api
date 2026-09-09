# Rule: testing

- **Unit tests** live next to source as `*.spec.ts`, run by `pnpm test` (jest).
  - Single file: `pnpm test path/to/x.spec.ts`. Single test: `pnpm test -t "name"`.
  - Cap output: `pnpm test 2>&1 | tail -n 30`, add `--silent`.
- **e2e** in `test/*.e2e-spec.ts`, `RUN_E2E=1 pnpm test:e2e` — self-skips without the flag,
  needs a reachable `DATABASE_URL` (`pnpm db:up`).
- What to test when adding logic:
  - **Service** — business rules, ownership checks, error paths (mock repositories).
  - **Zod schema** — accepts a valid payload, rejects each invalid field with the right
    `fieldErrors` key.
  - **Guard/permission wiring** for a new backoffice route (has code, superadmin bypasses).
  - Don't unit-test thin controllers or repositories against a real DB — cover those in e2e.
- Mock at the repository boundary, not `PrismaService`.
- A bug fix ships with a test that fails before the fix.
- Definition of done includes `pnpm test` green — never mark work done with red or skipped
  tests without saying so.
