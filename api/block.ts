// Web Handler signature (no @vercel/node needed)
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const n = url.searchParams.get("blockNumber");
  const blockNumber = n ? BigInt(n) : 123456n;

  const rpc = process.env.ALCHEMY_HTTP_URL;
  if (!rpc) return json({ error: "Missing ALCHEMY_HTTP_URL" }, 500);

  const client = createPublicClient({ chain: mainnet, transport: http(rpc) });
  const block = await client.getBlock({ blockNumber });
  return cachedJson(block, 10, 30);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function cachedJson(body: unknown, s: number, stale: number): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${s}, s-maxage=${s}, stale-while-revalidate=${stale}` }
  });
}
