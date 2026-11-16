import { describe, expect, it } from "vitest";

import { allowedOrigins, checkRpcBody, MAX_BATCH, MAX_BODY_BYTES, relayNetwork } from "./_rpc-guard";

const call = (method: string, id = 1) => ({ jsonrpc: "2.0", id, method, params: [] });

describe("RPC relay guard", () => {
  it("accepts allowed read methods, single and batched", () => {
    expect(checkRpcBody(JSON.stringify(call("eth_call"))).ok).toBe(true);
    expect(checkRpcBody(JSON.stringify([call("eth_chainId"), call("eth_getBalance", 2)])).ok).toBe(true);
  });

  it("refuses transaction submission and privileged methods", () => {
    for (const method of ["eth_sendRawTransaction", "eth_sendTransaction", "debug_traceCall", "admin_peers"]) {
      expect(checkRpcBody(JSON.stringify(call(method)))).toMatchObject({ ok: false, status: 403 });
    }
    // One bad request in a batch refuses the whole batch.
    expect(checkRpcBody(JSON.stringify([call("eth_call"), call("eth_sendRawTransaction")])).ok).toBe(false);
  });

  it("refuses malformed, empty, oversized and over-long requests", () => {
    expect(checkRpcBody("not json")).toMatchObject({ ok: false, status: 400 });
    expect(checkRpcBody("[]")).toMatchObject({ ok: false, status: 400 });
    expect(checkRpcBody(JSON.stringify({ id: 1 }))).toMatchObject({ ok: false, status: 400 });
    expect(checkRpcBody(" ".repeat(MAX_BODY_BYTES + 1))).toMatchObject({ ok: false, status: 413 });
    const batch = Array.from({ length: MAX_BATCH + 1 }, (_, i) => call("eth_call", i));
    expect(checkRpcBody(JSON.stringify(batch))).toMatchObject({ ok: false, status: 400 });
  });

  it("serves only Ethereum and Base", () => {
    expect(relayNetwork("/api/rpc/base")).toBe("base");
    expect(relayNetwork("/api/rpc/ethereum/")).toBe("ethereum");
    expect(relayNetwork("/api/rpc/polygon")).toBeNull();
    expect(relayNetwork("/api/rpc/../admin")).toBeNull();
  });

  it("allows this site's origin plus configured extras", () => {
    const origins = allowedOrigins(" https://preview.example.test/ , ");
    expect(origins.has("https://dex.lumsian.com")).toBe(true);
    expect(origins.has("https://preview.example.test")).toBe(true);
    expect(origins.has("https://evil.example")).toBe(false);
  });
});
