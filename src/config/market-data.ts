// Public URL only. Shaggy Dogg Crypto Market-Data (../shaggy-dogg-market-data).
// Production builds default to this site's origin: vercel.json forwards /api/market-data/* to the service.
export const MARKET_DATA_URL = (
  import.meta.env.VITE_MARKET_DATA_URL || (import.meta.env.DEV ? "http://localhost:8010" : "")
).replace(/\/+$/, "");
