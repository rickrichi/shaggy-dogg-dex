# Repository Guidelines

## Architecture and sources of truth

Shaggy Dogg DEX combines a React/TypeScript frontend, Hono API, Solidity
contracts, and an Electron desktop app. `src/App.tsx` composes routing and
providers; `src/hooks/` and `src/lib/` contain wallet, swap, and market logic.
`server/src/index.ts` mounts the canonical API. `api/` contains Vercel endpoints
that forward API requests. The separate RPC service starts in
`server/src/rpc/main.ts`.

`contracts/src/` is canonical Solidity. `deployments/` and `audit/` record
deployment and review evidence. `supabase/` contains database assets, while
the Hono admin store uses local SQLite. Desktop backend packaging depends on
the sibling `../crypto-arb/backend` repository.

Prefer package scripts, configuration, and executing source over older prose
in `README.md`, `documentation/`, or `.zencoder/rules/repo.md`. Do not assume
historical deployment reports describe current chain state.

## Development and validation

Run commands from the repository root. Use npm and preserve npm lockfiles.
The server requires Node >=22.13.0; also check installed tool requirements.
CI currently specifies Node 20, so do not copy that version into setup guidance.

`npm run dev` starts both Vite and Hono; do not also start `api:dev`.
For separate terminals, use `npm run dev:vite` and `npm run api:dev`.

| Area           | Validation                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Frontend       | `npm run type-check`; `npm run lint`; `npm test -- --run`; `npm run build`                       |
| Backend        | `npm --prefix server run typecheck`; `npm --prefix server test`; `npm --prefix server run build` |
| Contracts      | `npm run contracts:check` (Foundry and fork RPC access required)                                 |
| Desktop server | `node --test desktop/server.test.cjs` (requires built `dist/`)                                   |

Run affected checks; use scoped rules for targeted tests. Report missing
prerequisites and skipped checks separately from passes. Root Vitest excludes
`server/`; root ESLint also excludes backend, contracts, and desktop code.

## Working conventions

Inspect `git status` and preserve unrelated edits. Exclude dependencies,
build output, coverage, and caches from routine searches. Follow TypeScript,
ESLint, and Prettier configuration. Commit messages use `type(scope): summary`
or `type: summary`; commit only when requested.

Do not dump `.env*` or credential-related documentation. Use example files and
environment variable names; redact secret values. Private credentials must
not enter browser-exposed `VITE_*` variables. Local code work does not authorize
live trades, transaction broadcasts, deployments, or credential changes.

Keep shared settings in `.claude/settings.json`. Personal overrides belong in
`.claude/settings.local.json`; ensure it is git-ignored before creating it.
