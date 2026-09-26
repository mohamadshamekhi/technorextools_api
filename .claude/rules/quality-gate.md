# Rule: quality gate (self-check before calling work done)

Applies whenever you touch a service/controller/repository, not just when asked to "review".

## Output discipline
- No preamble, no restated plan, no re-reading a file you just wrote.
- Output = the diff. Add at most one line of prose only when the logic isn't obvious
  (e.g. why a write needs `$transaction`, why a query needs a new index).

## Auto-fix on touch (don't ask, just fix + say why in one line)
When you're already editing a file/path, fix these on sight even if unrelated to the ask:
- Query filtering/sorting on a field with no index and likely high cardinality/traffic.
- N+1: a loop issuing one query per iteration instead of one batched `findMany`/`include`.
- A multi-step write that must be all-or-nothing (e.g. decrement stock + create order,
  create order + create payment) not wrapped in `prisma.$transaction`. `$transaction` is used in
  repositories for batched writes. Checkout spans several repositories, so it is guarded
  instead by an atomic cart lock (`CartRepository.acquireCheckoutLock`) plus compensation
  (`OrdersService.abortCheckout`); order status changes use the atomic
  `OrderRepository.transition` compare-and-set. Follow those patterns for new multi-step writes.
- A shared-resource race (stock/inventory decrement, coupon redemption count) not guarded by
  an atomic update (`updateMany` with a quantity-floor `where` clause, or a transaction with a
  re-read check) — a plain read-then-write is a bug here.
- Input reaching a service method without having passed a Zod schema first.
- An error response that echoes a stack trace, Prisma error internals, or a raw DB message.
- A payment or order-creation endpoint that isn't idempotent against retry/double-submit
  (duplicate network retry must not create two orders or capture payment twice).

## Definition of done (hard gate)
1. `pnpm typecheck && pnpm lint && pnpm build && pnpm test` — all green. Never report done
   with red/skipped tests without saying so explicitly.
2. If `prisma/schema.prisma` changed: `pnpm prisma:generate` run, and the change is a
   `db push`-safe change or you've called out the destructive part by hand (see
   `.claude/rules/prisma-and-data.md`).
3. New/changed endpoint → Postman request added/updated (`.claude/rules/adding-an-endpoint.md`).
4. Structural/contract change → `CLAUDE.md` or `docs/` updated in the same change.
5. Any frontend-facing change (new/changed response field, enum value, request field, URL,
   error shape, header, behavior) → say so explicitly in Persian in the final reply, per
   `CLAUDE.md` convention 6. Never leave it implicit in the diff.

## Pattern-match before writing new code
Before a new endpoint/service/repository method, grep 1-2 existing siblings in the same
domain for: response envelope shape, error type used for each failure case, DI/constructor
style, naming (`Backoffice*`/`Storefront*`, `toView()`). Copy that pattern exactly — don't
invent a new generic shape. If Postman or `docs/architecture.md` disagrees with what the
code actually does, code + Postman win; flag the doc drift instead of silently picking one.
