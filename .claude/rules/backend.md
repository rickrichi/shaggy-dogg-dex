---
paths:
  - "server/**/*"
  - "api/**/*"
  - "supabase/**/*"
  - "vercel.json"
  - "render.yaml"
---

# Backend and API boundaries

- Keep API behavior in `server/src/routes/` and mounting in
  `server/src/index.ts`; preserve the `/api` namespace. Keep Vercel forwarding
  consistent through `api/_proxy.ts`. Verify routes in source because
  `api/README.md` describes endpoints that are no longer present.
- Preserve middleware ordering, CORS preflight behavior, security headers,
  rate limits, schema validation, webhook verification, and wallet sessions.
  Use server-side environment configuration for provider credentials.
- Server TypeScript uses NodeNext ESM; retain `.js` extensions for relative
  runtime imports. `node:sqlite` backs the admin store and RPC store; Supabase
  migrations do not migrate those stores.
- The Hono API defaults to port 8788. The RPC service is separately started
  with `npm --prefix server run rpc:dev` and defaults to loopback port 8790.
  Preserve RPC authentication and the explicit send-transaction opt-in.
- Backend tests use Node through `server/vitest.config.ts`. For example:
  `npm --prefix server test -- src/routes/admin.test.ts`.
  Run backend type checking and tests separately from frontend validation;
  run `npm --prefix server run rpc:build` when changing RPC packaging.
- For Supabase changes, consult the repository's Postgres skill at
  `.agents/skills/supabase-postgres-best-practices/SKILL.md`, preserve RLS and
  privilege boundaries, and distinguish local migrations from remote changes.
