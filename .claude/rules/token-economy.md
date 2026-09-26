# Token economy & professional-work rules

Imported from the root CLAUDE.md. Follow these.

## Reading
- Never read a large file (>300 lines) in full. Grep first, then read the target range with offset/limit.
- Do not re-read a file you just Edit/Write "to be sure".
- To find patterns/naming/usages across the repo, call the `repo-explorer` subagent with a scoped ask and take only its conclusion — do not open ten files in the main context.

## Writing replies
- Default short (1-3 lines). No preamble, no restating the request, no summary unless a multi-file change.
- Describe the diff, don't paste the whole file.
- Reference as `path:line`.

## Running
- Run independent commands in parallel in one message.
- Cap noisy command output — it all goes into context:
  - `pnpm typecheck 2>&1 | tail -n 20`
  - `pnpm lint 2>&1 | tail -n 20`
  - `pnpm build 2>&1 | tail -n 15`
  - `pnpm test 2>&1 | tail -n 30` (add `--silent`; for one file pass its path)
- `git diff`/`git log`: scope to paths, use `--stat` first, `-n` for log.
- Never `cat` a large/generated file; Grep or Read-with-range instead.

## Architecture (CLAUDE.md digest — avoids round-trips)
- Split every endpoint by consumer: `modules/backoffice/<domain>` or `modules/storefront/<domain>`; only `auth` sits at `/api/v1` root.
- Thin controller -> service (logic) -> repository (the only caller of `this.prisma.<model>`) -> Prisma.
- One repository per Prisma model; aggregate child rows get no repo of their own.
- Validation is Zod only, in `*.schemas.ts`; no class-validator / DTO classes.
- Errors via `HttpException` + `AllExceptionsFilter`; don't re-catch common Prisma errors.
- Money = integer Toman. ID = ObjectId string.
- Every new/changed endpoint -> a request in `postman/abzar-api.postman_collection.json`, same change.
- Ambiguity in contract/domain/field/role boundary -> ask, don't infer.
