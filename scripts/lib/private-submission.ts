import { createPublicClient, http } from "viem";

export function privateSubmissionConfig(env: NodeJS.ProcessEnv) {
  const endpoint = env.PRIVATE_BASE_RPC_HTTP;
  if (!endpoint) throw new Error("Configure PRIVATE_BASE_RPC_HTTP in the server environment.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Submission endpoint must be HTTPS without user info or fragments.");
  const provider = env.PRIVATE_BASE_RPC_PROVIDER;
  if (provider === "alchemy") {
    if (url.hostname !== "base-mainnet.g.alchemy.com" || !/^\/v2\/[^/]+$/.test(url.pathname))
      throw new Error("Alchemy submission requires its Base mainnet endpoint.");
  } else if (provider === "quicknode") {
    if (!url.hostname.endsWith(".quiknode.pro") || env.PRIVATE_BASE_MEV_ENABLED !== "true")
      throw new Error("QuickNode requires a dedicated endpoint with MEV protection enabled.");
  } else {
    throw new Error("Select a documented provider: alchemy or quicknode.");
  }
  return { provider, endpoint, transport: http(endpoint, { retryCount: 0, timeout: 10_000 }) };
}

export async function verifyPrivateSubmission(env: NodeJS.ProcessEnv) {
  const config = privateSubmissionConfig(env);
  try {
    const client = createPublicClient({ transport: config.transport });
    if (await client.getChainId() !== 8453) throw new Error("Wrong chain");
    await client.getBlockNumber();
  } catch {
    // RPC exceptions often contain credential-bearing URLs.
    throw new Error("Private Base endpoint failed authentication or chain/health validation. No public fallback.");
  }
  return config;
}
