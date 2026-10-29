import 'dotenv/config';

import {
  createPublicClient,
  fallback,
  getAddress,
  http,
  parseAbi,
  type Address,
} from 'viem';
import { base } from 'viem/chains';

const POOL = getAddress('0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5');
const WETH = getAddress('0x4200000000000000000000000000000000000006');
const MRWD = getAddress('0xC17227AAa33C54634B6cE7AD0bf33A156563c179');

// Uniswap deploys V3 at different addresses on some chains. This is the
// canonical Base (chain 8453) V3 factory, not Ethereum's 0x1F984... factory.
const UNISWAP_V3_FACTORY = getAddress('0x33128a8fC17869897dcE68Ed026d694621f6FDfD');
const UNISWAP_V3_QUOTER_V2 = getAddress('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a');
const FEE = 3_000;
const SAMPLE_WETH = 1_000_000_000_000_000n; // 0.001 WETH

const poolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function factory() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
]);

const factoryAbi = parseAbi([
  'function getPool(address,address,uint24) view returns (address)',
]);

const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
]);

const rpcUrls = [
  process.env.BASE_RPC_URL,
  'https://base-rpc.publicnode.com',
  'https://1rpc.io/base',
  'https://mainnet.base.org',
].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);

const client = createPublicClient({
  chain: base,
  transport: fallback(
    rpcUrls.map((url) => http(url, { retryCount: 1, timeout: 12_000 })),
    { rank: false },
  ),
});

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

type ZeroXSources = { sources?: string[]; zid?: string };

type ZeroXPrice = {
  buyAmount?: string;
  liquidityAvailable?: boolean;
  route?: { fills?: Array<{ source?: string; proportionBps?: string }> };
  issues?: unknown;
  zid?: string;
};

async function checkZeroX(apiKey: string | undefined) {
  if (!apiKey) {
    return {
      checked: false,
      reason: 'ZEROX_API_KEY is not configured',
      baseSupported: true,
      uniswapV3SourceSupported: null,
      wethToMrwdRoutable: null,
    } as const;
  }

  const headers = { '0x-api-key': apiKey, '0x-version': 'v2' };
  const sourcesUrl = new URL('https://api.0x.org/sources');
  sourcesUrl.searchParams.set('chainId', String(base.id));
  const sourcesResponse = await fetch(sourcesUrl, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (!sourcesResponse.ok) {
    throw new Error(`0x sources request failed: HTTP ${sourcesResponse.status}`);
  }
  const sources = (await sourcesResponse.json()) as ZeroXSources;

  // An indicative price is the meaningful test for this pair. Source support
  // alone does not prove that 0x can currently route WETH/MRWD.
  const priceUrl = new URL('https://api.0x.org/swap/allowance-holder/price');
  priceUrl.searchParams.set('chainId', String(base.id));
  priceUrl.searchParams.set('sellToken', WETH);
  priceUrl.searchParams.set('buyToken', MRWD);
  priceUrl.searchParams.set('sellAmount', SAMPLE_WETH.toString());
  const priceResponse = await fetch(priceUrl, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  const priceBody = (await priceResponse.json()) as ZeroXPrice;

  return {
    checked: true,
    baseSupported: true,
    uniswapV3SourceSupported: sources.sources?.includes('UniswapV3') ?? false,
    wethToMrwdRoutable:
      priceResponse.ok && priceBody.liquidityAvailable !== false && Boolean(priceBody.buyAmount),
    priceHttpStatus: priceResponse.status,
    sampleSellAmountWeth: SAMPLE_WETH.toString(),
    sampleBuyAmountMrwd: priceBody.buyAmount ?? null,
    routeSources: [
      ...new Set(priceBody.route?.fills?.map((fill) => fill.source).filter(Boolean) ?? []),
    ],
    issues: priceBody.issues ?? null,
    requestId: priceBody.zid ?? sources.zid ?? null,
  } as const;
}

async function main() {
  const blockNumber = await client.getBlockNumber();
  const [token0, token1, poolFactory, fee, liquidity, registeredPool] =
    await client.multicall({
      allowFailure: false,
      blockNumber,
      contracts: [
        { address: POOL, abi: poolAbi, functionName: 'token0' },
        { address: POOL, abi: poolAbi, functionName: 'token1' },
        { address: POOL, abi: poolAbi, functionName: 'factory' },
        { address: POOL, abi: poolAbi, functionName: 'fee' },
        { address: POOL, abi: poolAbi, functionName: 'liquidity' },
        {
          address: UNISWAP_V3_FACTORY,
          abi: factoryAbi,
          functionName: 'getPool',
          args: [WETH, MRWD, FEE],
        },
      ],
    });

  const identityValid =
    sameAddress(token0, WETH) && sameAddress(token1, MRWD) && fee === FEE;
  const canonical =
    identityValid &&
    sameAddress(poolFactory, UNISWAP_V3_FACTORY) &&
    sameAddress(registeredPool, POOL);

  const [directAmountOut, , initializedTicksCrossed, directGasEstimate] =
    await client.simulateContract({
      address: UNISWAP_V3_QUOTER_V2,
      abi: quoterAbi,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn: WETH,
          tokenOut: MRWD,
          amountIn: SAMPLE_WETH,
          fee: FEE,
          sqrtPriceLimitX96: 0n,
        },
      ],
      blockNumber,
    }).then(({ result }) => result);

  const zerox = await checkZeroX(process.env.ZEROX_API_KEY);
  const report = {
    checkedAt: new Date().toISOString(),
    chainId: base.id,
    blockNumber: blockNumber.toString(),
    pool: POOL,
    identityValid,
    canonicalUniswapV3Pool: canonical,
    factory: poolFactory,
    expectedFactory: UNISWAP_V3_FACTORY,
    factoryRegisteredPool: registeredPool,
    fee,
    activeLiquidityRaw: liquidity.toString(),
    directUniswapQuote: {
      available: directAmountOut > 0n,
      sellAmountWeth: SAMPLE_WETH.toString(),
      buyAmountMrwd: directAmountOut.toString(),
      initializedTicksCrossed,
      gasEstimate: directGasEstimate.toString(),
    },
    zerox,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!canonical || liquidity === 0n || directAmountOut === 0n) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
