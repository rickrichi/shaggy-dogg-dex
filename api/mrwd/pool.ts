/**
 * Verified WETH/MRWD Uniswap V3 pool snapshot for bot discovery.
 *
 * Public route: GET /api/mrwd/pool.json
 * Runtime: Vercel Edge
 */
import { createPublicClient, fallback, getAddress, http, parseAbi, type Address } from "viem";
import { base } from "viem/chains";

export const config = { runtime: "edge" };

const POOL = getAddress("0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5");
const WETH = getAddress("0x4200000000000000000000000000000000000006");
const MRWD = getAddress("0xC17227AAa33C54634B6cE7AD0bf33A156563c179");
const EXPECTED_FEE = 3_000;

const poolAbi = parseAbi([
  "function factory() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (int24)",
  "function liquidity() view returns (uint128)",
  "function feeGrowthGlobal0X128() view returns (uint256)",
  "function feeGrowthGlobal1X128() view returns (uint256)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

const tokenAbi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const rpcUrls = [
  process.env.BASE_RPC_URL,
  "https://base-rpc.publicnode.com",
  "https://1rpc.io/base",
  "https://mainnet.base.org",
].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);

const client = createPublicClient({
  chain: base,
  transport: fallback(
    rpcUrls.map((url) => http(url, { retryCount: 1, timeout: 10_000 })),
    { rank: false }
  ),
});

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

async function poolSnapshot() {
  const block = await client.getBlock({ blockTag: "latest" });
  const blockNumber = block.number;
  const contracts = [
    { address: POOL, abi: poolAbi, functionName: "factory" },
    { address: POOL, abi: poolAbi, functionName: "token0" },
    { address: POOL, abi: poolAbi, functionName: "token1" },
    { address: POOL, abi: poolAbi, functionName: "fee" },
    { address: POOL, abi: poolAbi, functionName: "tickSpacing" },
    { address: POOL, abi: poolAbi, functionName: "liquidity" },
    { address: POOL, abi: poolAbi, functionName: "feeGrowthGlobal0X128" },
    { address: POOL, abi: poolAbi, functionName: "feeGrowthGlobal1X128" },
    { address: POOL, abi: poolAbi, functionName: "slot0" },
    { address: WETH, abi: tokenAbi, functionName: "symbol" },
    { address: WETH, abi: tokenAbi, functionName: "decimals" },
    { address: MRWD, abi: tokenAbi, functionName: "symbol" },
    { address: MRWD, abi: tokenAbi, functionName: "decimals" },
  ] as const;

  const [
    factory,
    token0,
    token1,
    fee,
    tickSpacing,
    liquidity,
    feeGrowthGlobal0X128,
    feeGrowthGlobal1X128,
    slot0,
    wethSymbol,
    wethDecimals,
    mrwdSymbol,
    mrwdDecimals,
  ] = await client.multicall({ contracts, blockNumber, allowFailure: false });

  if (
    !sameAddress(token0, WETH) ||
    !sameAddress(token1, MRWD) ||
    fee !== EXPECTED_FEE ||
    wethSymbol !== "WETH" ||
    mrwdSymbol !== "MRWD"
  ) {
    throw new Error("On-chain pool identity verification failed");
  }

  const [
    sqrtPriceX96,
    tick,
    observationIndex,
    observationCardinality,
    observationCardinalityNext,
    feeProtocol,
    unlocked,
  ] = slot0;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    chain: { id: base.id, name: "Base", nativeCurrency: "ETH" },
    pool: {
      address: POOL,
      type: "uniswap-v3",
      factory,
      feeTier: fee,
      feePercent: fee / 10_000,
      tickSpacing,
      activeLiquidityRaw: liquidity.toString(),
      tick,
      sqrtPriceX96: sqrtPriceX96.toString(),
      unlocked,
      observations: {
        index: observationIndex,
        cardinality: observationCardinality,
        cardinalityNext: observationCardinalityNext,
      },
      feeProtocol,
      feeGrowthGlobal0X128: feeGrowthGlobal0X128.toString(),
      feeGrowthGlobal1X128: feeGrowthGlobal1X128.toString(),
    },
    tokens: [
      { index: 0, address: WETH, symbol: wethSymbol, decimals: wethDecimals },
      { index: 1, address: MRWD, symbol: mrwdSymbol, decimals: mrwdDecimals },
    ],
    block: {
      number: blockNumber.toString(),
      hash: block.hash,
      timestamp: block.timestamp.toString(),
    },
    links: { explorer: `https://basescan.org/address/${POOL}` },
  };
}

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { ...responseHeaders, Allow: "GET, HEAD" } }
    );
  }

  try {
    const data = await poolSnapshot();
    return new Response(req.method === "HEAD" ? null : JSON.stringify(data, null, 2), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("MRWD pool snapshot failed", error);
    return Response.json(
      { error: "Pool data temporarily unavailable" },
      { status: 503, headers: { ...responseHeaders, "Cache-Control": "no-store" } }
    );
  }
}
