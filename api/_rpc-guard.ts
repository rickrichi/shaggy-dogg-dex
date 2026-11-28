/**
 * Request checks for the browser-facing RPC relay (api/rpc/[network].ts).
 *
 * The relay holds a server-side API key, and anyone on the internet can reach it, so it forwards
 * only the read methods a swap page needs, from this site's own pages, in bounded requests.
 * Transactions are never relayed: the user's wallet signs and broadcasts them itself.
 */

export const RELAY_NETWORKS = ["ethereum", "base", "polygon"] as const;
export type RelayNetwork = (typeof RELAY_NETWORKS)[number];

/**
 * Just under the Golden-Fleas gateway's 1 MiB body limit (GATEWAY_BODY_LIMIT), so anything this
 * relay forwards the gateway will also accept. The old 64 KB cap refused the Stake page's
 * position multicalls (one ~296 KB request) and, with 20-request batches, the triangular quotes.
 */
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_BATCH = 50;

export const ALLOWED_METHODS: ReadonlySet<string> = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
]);

export const DEFAULT_ALLOWED_ORIGINS = ["https://dex.lumsian.com"] as const;

export function allowedOrigins(extra: string | undefined): Set<string> {
  const listed = (extra ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...listed]);
}

export function relayNetwork(pathname: string): RelayNetwork | null {
  const last = pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  return (RELAY_NETWORKS as readonly string[]).includes(last) ? (last as RelayNetwork) : null;
}

export type GuardResult =
  | { readonly ok: true; readonly body: string }
  | { readonly ok: false; readonly status: number; readonly message: string };

function isRequest(value: unknown): value is { method: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validates a JSON-RPC body (single request or batch) and returns it re-serialized. */
export function checkRpcBody(raw: string): GuardResult {
  if (raw.length > MAX_BODY_BYTES) return { ok: false, status: 413, message: "request too large" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, message: "invalid JSON" };
  }

  const requests = Array.isArray(parsed) ? parsed : [parsed];
  if (requests.length === 0) return { ok: false, status: 400, message: "empty batch" };
  if (requests.length > MAX_BATCH) return { ok: false, status: 400, message: "batch too large" };

  for (const request of requests) {
    if (!isRequest(request) || typeof request.method !== "string") {
      return { ok: false, status: 400, message: "invalid JSON-RPC request" };
    }
    if (!ALLOWED_METHODS.has(request.method)) {
      return { ok: false, status: 403, message: `method not allowed: ${request.method}` };
    }
  }
  return { ok: true, body: JSON.stringify(parsed) };
}
