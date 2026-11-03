// Public URLs only; credentials belong in crypto-arb/backend/.env.
// The local crypto-arb backend (dev server, desktop app) serves the live stream, accounts and trading.
export const ARB_PRIVATE_API = import.meta.env.DEV || Boolean(import.meta.env.VITE_ARB_API_URL);
export const ARB_API_URL = (
  import.meta.env.VITE_ARB_API_URL || (import.meta.env.DEV ? "http://localhost:8000" : "")
).replace(/\/+$/, "");
// The public site has no crypto-arb backend: vercel.json forwards /api/arbitrage/* to the read-only
// spread feed on the market-data service, and the page polls it instead of opening a WebSocket.
export const ARB_SNAPSHOT_URL = ARB_PRIVATE_API
  ? `${ARB_API_URL}/api/snapshot`
  : "/api/arbitrage/snapshot";
export const ARB_WS_URL =
  import.meta.env.VITE_ARB_WS_URL ||
  (ARB_PRIVATE_API ? `${ARB_API_URL.replace(/^http/, "ws")}/ws` : "");
