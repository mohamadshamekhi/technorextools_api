# .claude/

Professional Claude Code config for this repo — goal: lower token use.

| File | Purpose |
| --- | --- |
| `settings.json` | allowlist of safe commands (no repeated prompts) + deny on `.env`/push/prisma push · enables the output style |
| `output-styles/concise-fa.md` | Persian replies, very terse, token-frugal |
| `rules/token-economy.md` | low-cost read/write/run rules + architecture digest — **auto-loaded** via `CLAUDE.md` |
| `rules/adding-an-endpoint.md` | ordered checklist for any new/changed endpoint |
| `rules/prisma-and-data.md` | schema-change workflow + repository/data-access rules |
| `rules/nestjs-style.md` | layering, modules, guards, DI, types, error style |
| `rules/testing.md` | unit/e2e conventions, what to test, mocking boundary |
| `rules/security.md` | trust-boundary checklist (auth/input/queries/ownership) |
| `rules/git-and-delivery.md` | branching, commits, PR, delivery gate |
| `agents/repo-explorer.md` | read-only broad search (sonnet) — keeps main context light |
| `agents/api-reviewer.md` | reviews the diff against repo conventions |

Only `token-economy.md` is auto-loaded. The rest are pointed to from the `CLAUDE.md` table
and read on demand — keeps every session's base context small.

## Use
- output style: auto from `settings.json`. Manual: `/output-style concise-fa`
- agent: "use the repo-explorer subagent to ..." or "use api-reviewer"

`settings.local.json` is for personal overrides (git-ignored).
