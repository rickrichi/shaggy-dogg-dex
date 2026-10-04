// Public URLs only; credentials belong in crypto-arb/backend/.env.
export const ARB_API_URL = (import.meta.env.VITE_ARB_API_URL || "http://localhost:8000").replace(/\/+$/, "");
export const ARB_WS_URL = import.meta.env.VITE_ARB_WS_URL || `${ARB_API_URL.replace(/^http/, "ws")}/ws`;
