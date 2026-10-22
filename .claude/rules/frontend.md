---
paths:
  - "src/**/*"
  - "vite.config.ts"
  - "vitest.config.ts"
  - "tailwind.config.ts"
  - "tsconfig.app.json"
---

# Frontend

- Reuse the Wagmi/RainbowKit and TanStack Query providers in `src/App.tsx`,
  wallet configuration in `src/wagmi.ts`, and existing components in
  `src/components/ui/`. Preserve lazy route loading.
- Preserve strict TypeScript, `exactOptionalPropertyTypes`, and
  `noUncheckedIndexedAccess`. Use `@/` imports where appropriate. Follow
  `.prettierrc`: two spaces, double quotes, semicolons, LF, and Tailwind sorting.
- Use the existing Viem amount conversion and chain-aware configuration.
  Keep token amounts in integer base units for transactions. Preserve wallet
  chain checks, quote expiry, allowance handling, and slippage protections.
- Limit orders in `src/components/swap/LimitOrderCard.tsx` are preview-only.
  Do not present previews or proposed protocol economics as executed or live.
- Keep Hono API calls on the existing `/api` routing. Arbitrage uses the
  separate endpoint configuration in `src/config/crypto-arb.ts`.
- Vite can return `ok: true` with `devFallback: true` when Hono is offline.
  Check the actual backend response before reporting backend health.
- Tests use Vitest, Happy DOM, and React Testing Library with helpers in
  `src/test/`. Run a targeted test with
  `npm test -- --run src/hooks/useSwap.test.ts`. Mock network and wallet writes
  for unit tests; do not execute real swaps as UI validation.
