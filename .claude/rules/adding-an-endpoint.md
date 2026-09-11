# Rule: adding or changing an endpoint

Follow in order. Stop and ask (convention 4) if any boundary is unclear.

0. **Pattern-match first.** Grep 1-2 existing endpoints in the same/nearest domain for
   response envelope shape, error type per failure case, and naming before writing anything —
   see `.claude/rules/quality-gate.md`. The contract is whatever the code + Postman collection
   already do, not a generic REST convention.
1. **Pick the consumer & module.** `backoffice` (admin) or `storefront` (public/customer)?
   Path `src/modules/<consumer>/<domain>/`. A domain both apps need → two controllers over
   one shared service. Only `auth` sits at `/api/v1` root.
2. **Zod schema** in `<domain>.schemas.ts` — body, query, params. Infer types with `z.infer`.
   Persian messages. No `class-validator`, no DTO class.
3. **Repository** — if a new Prisma model is involved it gets its own
   `repositories/<model>.repository.ts` (the only caller of `this.prisma.<model>`). Aggregate
   child rows stay in the parent's repository.
4. **Service** — business logic, validation beyond Zod, cross-repo orchestration,
   transactions, `toView()` mapping. Never inject `PrismaService`.
5. **Controller** — thin. `new ZodValidationPipe(schema)` on every input; delegate to the
   service; return the view. Throw `HttpException` subclasses for expected failures, never
   `res.status().json()`.
6. **Guard**
   - backoffice: `@RequirePermissions('<group>.<action>')` on every route. New code →
     add it to `src/modules/access/permission.catalog.ts` and re-seed (`pnpm prisma:seed`).
   - storefront authenticated: owner-scoped — re-check ownership in the service.
   - storefront public read: `@Public()`.
   - guest + user (cart-like): `@OptionalAuth()` + `X-Cart-Token`.
7. **Re-check auth and ownership** on every read and write. This service is the trust boundary.
8. **Postman** (`postman/abzar-api.postman_collection.json`, same change) — request under the
   matching folder, realistic body, `{{baseUrl}}`/`{{accessToken}}`/`{{userId}}` vars, a test
   script capturing reusable ids/tokens, description names the schema + response shape.
   Verify the JSON parses.
9. **Docs** — update `CLAUDE.md` (contract/conventions) or `docs/status.md` (build progress)
   in the same change.
10. **Green** — `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.
