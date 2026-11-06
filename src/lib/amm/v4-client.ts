// src/lib/amm/v4-client.ts — chain reads behind the Uniswap v4 page: pool discovery, best quote
// (direct or two-hop), the wallet's positions with their holdings and uncollected fees, and the
// ERC-20 -> Permit2 -> spender approval chain. Everything is read from chain; nothing is estimated.
import {
  type Address,
  getAddress,
  type Hex,
  parseAbi,
  parseAbiItem,
  type PublicClient,
  zeroAddress,
} from "viem";

import {
  decodePositionInfo,
  MAX_UINT160,
  NATIVE,
  type PathKey,
  permit2Abi,
  poolId,
  type PoolKey,
  poolKey,
  positionManagerAbi,
  quoterAbi,
  stateViewAbi,
  V4,
  V4_TIERS,
  type V4ChainId,
} from "./uniswap-v4";
import { getAmountsForLiquidity, getSqrtPriceAtTick } from "./v4-math";

type Client = Pick<
  PublicClient,
  "readContract" | "simulateContract" | "multicall" | "getLogs" | "getBlockNumber"
>;

export interface PoolState {
  key: PoolKey;
  id: Hex;
  sqrtPriceX96: bigint;
  tick: number;
  lpFee: number;
  liquidity: bigint;
}

/** Initialized hook-less pools for a pair, one per standard tier, deepest first. */
export async function discoverPools(
  client: Client,
  chainId: V4ChainId,
  a: Address,
  b: Address
): Promise<PoolState[]> {
  const keys = V4_TIERS.map((t) => poolKey(a, b, t.fee, t.tickSpacing));
  const sv = V4[chainId].stateView;
  const res = await client.multicall({
    allowFailure: true,
    contracts: keys.flatMap((k) => [
      { address: sv, abi: stateViewAbi, functionName: "getSlot0", args: [poolId(k)] } as const,
      { address: sv, abi: stateViewAbi, functionName: "getLiquidity", args: [poolId(k)] } as const,
    ]),
  });
  const pools: PoolState[] = [];
  keys.forEach((key, i) => {
    const s = res[2 * i];
    const l = res[2 * i + 1];
    if (s?.status !== "success" || l?.status !== "success") return;
    const [sqrtPriceX96, tick, , lpFee] = s.result as readonly [bigint, number, number, number];
    if (sqrtPriceX96 === 0n) return;
    pools.push({ key, id: poolId(key), sqrtPriceX96, tick, lpFee, liquidity: l.result as bigint });
  });
  return pools.sort((x, y) => (y.liquidity > x.liquidity ? 1 : -1));
}

export type Route =
  | { kind: "single"; pool: PoolState; zeroForOne: boolean; amountOut: bigint; gasEstimate: bigint }
  | {
      kind: "multi";
      currencyIn: Address;
      path: PathKey[];
      via: Address;
      amountOut: bigint;
      gasEstimate: bigint;
    };

/**
 * Best exact-input route: every direct pool, then two hops through each hub (native ETH, USDC)
 * using the deepest pool on each leg. Quoted by V4Quoter (eth_call), so outputs are exact at the
 * current block.
 */
export async function bestRoute(
  client: Client,
  chainId: V4ChainId,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  hubs: readonly Address[]
): Promise<Route | null> {
  const quoter = V4[chainId].quoter;
  const routes: Route[] = [];
  const direct = await discoverPools(client, chainId, tokenIn, tokenOut);
  await Promise.all(
    direct
      .filter((p) => p.liquidity > 0n)
      .map(async (pool) => {
        const zeroForOne = pool.key.currency0.toLowerCase() === tokenIn.toLowerCase();
        try {
          const { result } = await client.simulateContract({
            address: quoter,
            abi: quoterAbi,
            functionName: "quoteExactInputSingle",
            args: [{ poolKey: pool.key, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
          });
          routes.push({
            kind: "single",
            pool,
            zeroForOne,
            amountOut: result[0],
            gasEstimate: result[1],
          });
        } catch {
          /* not enough liquidity for this size */
        }
      })
  );
  for (const hub of hubs) {
    if (hub.toLowerCase() === tokenIn.toLowerCase() || hub.toLowerCase() === tokenOut.toLowerCase())
      continue;
    const [leg1, leg2] = await Promise.all([
      discoverPools(client, chainId, tokenIn, hub),
      discoverPools(client, chainId, hub, tokenOut),
    ]);
    const p1 = leg1.find((p) => p.liquidity > 0n);
    const p2 = leg2.find((p) => p.liquidity > 0n);
    if (!p1 || !p2) continue;
    const path: PathKey[] = [
      {
        intermediateCurrency: getAddress(hub),
        fee: p1.key.fee,
        tickSpacing: p1.key.tickSpacing,
        hooks: zeroAddress,
        hookData: "0x",
      },
      {
        intermediateCurrency: getAddress(tokenOut),
        fee: p2.key.fee,
        tickSpacing: p2.key.tickSpacing,
        hooks: zeroAddress,
        hookData: "0x",
      },
    ];
    try {
      const { result } = await client.simulateContract({
        address: quoter,
        abi: quoterAbi,
        functionName: "quoteExactInput",
        args: [{ exactCurrency: tokenIn, path, exactAmount: amountIn }],
      });
      routes.push({
        kind: "multi",
        currencyIn: tokenIn,
        path,
        via: getAddress(hub),
        amountOut: result[0],
        gasEstimate: result[1],
      });
    } catch {
      /* hub route cannot fill this size */
    }
  }
  return routes.sort((x, y) => (y.amountOut > x.amountOut ? 1 : -1))[0] ?? null;
}

// ── Positions ────────────────────────────────────────────────────────────────────────────────

/** Block each PositionManager was deployed at, so log scans need not start from genesis. */
/** First block with PositionManager code (binary-searched on chain, 2026-11-06). */
export const POSITION_MANAGER_START: Record<V4ChainId, bigint> = {
  1: 21_689_089n,
  8453: 25_350_993n,
};

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed id)"
);
const stateViewFeeAbi = parseAbi([
  "function getFeeGrowthInside(bytes32 poolId, int24 tickLower, int24 tickUpper) view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)",
  "function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)",
]);

/**
 * Token IDs ever transferred to `owner`, newest first. Scans backwards from the head with an
 * adaptive range: as wide as the RPC accepts, halved on refusal, widened again after successes.
 * Stops after `maxRequests`; `complete` says whether it reached the deployment block.
 */
export async function findPositionIds(
  client: Client,
  chainId: V4ChainId,
  owner: Address,
  maxRequests = 80
): Promise<{ ids: bigint[]; complete: boolean; scannedFrom: bigint }> {
  const address = V4[chainId].positionManager;
  const start = POSITION_MANAGER_START[chainId];
  let to = await client.getBlockNumber();
  let range = to - start + 1n;
  const ids: bigint[] = [];
  for (let i = 0; i < maxRequests && to >= start; i++) {
    const from = to - range + 1n > start ? to - range + 1n : start;
    try {
      const logs = await client.getLogs({
        address,
        event: transferEvent,
        args: { to: owner },
        fromBlock: from,
        toBlock: to,
      });
      for (const l of [...logs].reverse()) if (l.args.id !== undefined) ids.push(l.args.id);
      to = from - 1n;
      range *= 2n;
    } catch {
      if (range <= 1_000n) break;
      range /= 4n;
    }
  }
  return { ids: [...new Set(ids)], complete: to < start, scannedFrom: to + 1n };
}

export interface PositionView {
  tokenId: bigint;
  owner: Address;
  key: PoolKey;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  pool: PoolState | null;
  inRange: boolean;
  amount0: bigint;
  amount1: bigint;
  fees0: bigint;
  fees1: bigint;
}

const Q128 = 1n << 128n;
const sub256 = (a: bigint, b: bigint) => (a - b + (1n << 256n)) % (1n << 256n);

/** A position's pool, holdings at the current price and uncollected fees, all from chain. */
export async function loadPositionView(
  client: Client,
  chainId: V4ChainId,
  tokenId: bigint
): Promise<PositionView> {
  const pm = V4[chainId].positionManager;
  const sv = V4[chainId].stateView;
  const [owner, [rawKey, info], liquidity] = await Promise.all([
    client.readContract({
      address: pm,
      abi: positionManagerAbi,
      functionName: "ownerOf",
      args: [tokenId],
    }),
    client.readContract({
      address: pm,
      abi: positionManagerAbi,
      functionName: "getPoolAndPositionInfo",
      args: [tokenId],
    }),
    client.readContract({
      address: pm,
      abi: positionManagerAbi,
      functionName: "getPositionLiquidity",
      args: [tokenId],
    }),
  ]);
  const key: PoolKey = {
    currency0: getAddress(rawKey.currency0),
    currency1: getAddress(rawKey.currency1),
    fee: rawKey.fee,
    tickSpacing: rawKey.tickSpacing,
    hooks: getAddress(rawKey.hooks),
  };
  const { tickLower, tickUpper } = decodePositionInfo(info);
  const id = poolId(key);
  const salt = `0x${tokenId.toString(16).padStart(64, "0")}` as Hex;
  const [slot0, poolL, inside, last] = await Promise.all([
    client.readContract({ address: sv, abi: stateViewAbi, functionName: "getSlot0", args: [id] }),
    client.readContract({
      address: sv,
      abi: stateViewAbi,
      functionName: "getLiquidity",
      args: [id],
    }),
    client.readContract({
      address: sv,
      abi: stateViewFeeAbi,
      functionName: "getFeeGrowthInside",
      args: [id, tickLower, tickUpper],
    }),
    client.readContract({
      address: sv,
      abi: stateViewFeeAbi,
      functionName: "getPositionInfo",
      args: [id, pm, tickLower, tickUpper, salt],
    }),
  ]);
  const [sqrtPriceX96, tick, , lpFee] = slot0 as readonly [bigint, number, number, number];
  const pool: PoolState | null =
    sqrtPriceX96 > 0n ? { key, id, sqrtPriceX96, tick, lpFee, liquidity: poolL as bigint } : null;
  const held = pool
    ? getAmountsForLiquidity(
        sqrtPriceX96,
        getSqrtPriceAtTick(tickLower),
        getSqrtPriceAtTick(tickUpper),
        liquidity
      )
    : { amount0: 0n, amount1: 0n };
  const [g0, g1] = inside as readonly [bigint, bigint];
  const [, last0, last1] = last as readonly [bigint, bigint, bigint];
  return {
    tokenId,
    owner: getAddress(owner),
    key,
    tickLower,
    tickUpper,
    liquidity,
    pool,
    inRange: !!pool && tick >= tickLower && tick < tickUpper,
    ...held,
    fees0: (sub256(g0, last0) * liquidity) / Q128,
    fees1: (sub256(g1, last1) * liquidity) / Q128,
  };
}

// ── Approvals ────────────────────────────────────────────────────────────────────────────────

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export interface ApprovalStep {
  label: string;
  call: {
    address: Address;
    abi: typeof erc20Abi | typeof permit2Abi;
    functionName: "approve";
    args: readonly unknown[];
  };
}

/**
 * The approvals an ERC-20 spend through `spender` (Universal Router or PositionManager) still
 * needs: the token -> Permit2 allowance, then Permit2 -> spender. Exact amounts, 30-minute expiry.
 * Native ETH needs none.
 */
export async function approvalsNeeded(
  client: Client,
  chainId: V4ChainId,
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint,
  nowSeconds: number
): Promise<ApprovalStep[]> {
  if (token === NATIVE || amount === 0n) return [];
  const permit2 = V4[chainId].permit2;
  const [erc20Allowance, [p2Amount, p2Expiry]] = await Promise.all([
    client.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, permit2],
    }),
    client.readContract({
      address: permit2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [owner, token, spender],
    }),
  ]);
  const steps: ApprovalStep[] = [];
  if (erc20Allowance < amount) {
    steps.push({
      label: "Allow Permit2 to move this token",
      call: { address: token, abi: erc20Abi, functionName: "approve", args: [permit2, amount] },
    });
  }
  if (p2Amount < amount || p2Expiry <= nowSeconds + 60) {
    if (amount > MAX_UINT160) throw new Error("Amount too large for Permit2");
    steps.push({
      label: "Allow Uniswap through Permit2",
      call: {
        address: permit2,
        abi: permit2Abi,
        functionName: "approve",
        args: [token, spender, amount, nowSeconds + 1800],
      },
    });
  }
  return steps;
}

export { erc20Abi };
