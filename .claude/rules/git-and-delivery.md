# Rule: git & delivery

- **Never commit or push unless asked.** If asked to commit while on `main`, branch first
  (`feat/<short>`, `fix/<short>`, `chore/<short>`).
- `git push` is denied in settings — the user pushes.
- One logical change per commit. Message: imperative subject ≤ 72 chars, body explains *why*.
  End commit messages with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- End PR descriptions with:
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`
- Before proposing a commit, run the full gate: `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.
- A change to an endpoint is not done without its Postman request and the `CLAUDE.md` /
  `docs/` update in the **same** commit.
- Prisma schema edits: `pnpm prisma:generate` output (the generated client is git-ignored,
  but the lockfile/schema are not) — commit `schema.prisma`, run `prisma:push` separately.
- Don't commit `.env*`, `dist/`, `coverage/`. `.claude/settings.local.json` is git-ignored
  (personal overrides).
- Use `gh` for PRs/issues.
