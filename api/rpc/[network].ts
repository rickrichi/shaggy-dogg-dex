/**
 * Browser-facing JSON-RPC relay to the Golden-Fleas gateway.
 *
 * Public route: POST /api/rpc/ethereum, POST /api/rpc/base
 * Runtime: Vercel Edge
 *
 * The swap page reads chain data through this route so the Golden-Fleas API key stays on the
 * server (GOLDEN_FLEAS_API_KEY, a Vercel environment variable) and never reaches the browser.
 * Checks live in ../_rpc-guard.ts. The browser keeps public RPC endpoints as fallback, so a
 * missing key or a relay error only means the page falls back to public endpoints.
 */
import { allowedOrigins, checkRpcBody, relayNetwork } from "../_rpc-guard.js";

export const config = { runtime: "edge" };

const GATEWAY_BASE = (process.env.GOLDEN_FLEAS_RPC_BASE ?? "https://rpc.lumsian.com/api/v1").replace(
  /\/+$/,
  ""
);
const UPSTREAM_TIMEOUT_MS = 10_000;

function rpcError(status: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message } }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return rpcError(405, "use POST");

  const network = relayNetwork(new URL(req.url).pathname);
  if (!network) return rpcError(404, "unsupported network");

  const origin = req.headers.get("origin");
  if (!origin || !allowedOrigins(process.env.RPC_RELAY_ALLOWED_ORIGINS).has(origin)) {
    return rpcError(403, "origin not allowed");
  }

  const apiKey = process.env.GOLDEN_FLEAS_API_KEY;
  if (!apiKey) return rpcError(503, "relay not configured");

  const checked = checkRpcBody(await req.text());
  if (!checked.ok) return rpcError(checked.status, checked.message);

  try {
    const upstream = await fetch(`${GATEWAY_BASE}/${network}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: checked.body,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch {
    return rpcError(502, "gateway unreachable");
  }
}
