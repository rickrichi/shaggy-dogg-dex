// src/lib/amm/uniswap-v4.ts — Uniswap v4 on Base and Ethereum: pool keys and IDs, pool state,
// quotes, swaps through the Universal Router, and PositionManager liquidity actions.
//
// Addresses: developers.uniswap.org/docs/protocols/v4/deployments (read 2026-11-06). Struct layouts
// and action codes: Uniswap/v4-periphery main (IV4Router.sol, Actions.sol), which match Universal
// Router 2.1.x — the router used here. Encodings are checked against live pools by simulation.
import {
  type Address,
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toHex,
  zeroAddress,
} from "viem";

export type V4ChainId = 1 | 8453;

export interface V4Deployment {
  poolManager: Address;
  positionManager: Address;
  stateView: Address;
  quoter: Address;
  /** Universal Router 2.1.2. */
  universalRouter: Address;
  permit2: Address;
}

export const V4: Record<V4ChainId, V4Deployment> = {
  1: {
    poolManager: getAddress("0x000000000004444c5dc75cB358380D2e3dE08A90"),
    positionManager: getAddress("0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e"),
    stateView: getAddress("0x7ffe42c4a5deea5b0fec41c94c136cf115597227"),
    quoter: getAddress("0x99bd42B2B22e531f283b7F8a86dFf631EB16A9D1"),
    universalRouter: getAddress("0x23617e59A5925b2A4Bf75d73ff6711cD0b29De85"),
    permit2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  },
  8453: {
    poolManager: getAddress("0x498581ff718922c3f8e6a244956af099b2652b2b"),
    positionManager: getAddress("0x7c5f5a4bbd8fd63184577525326123b519429bdc"),
    stateView: getAddress("0xa3c0c9b65bad0b08107aa264b0f3db444b867a71"),
    quoter: getAddress("0xE1A6C5803e3c44368b171BD680c7D32dfc92CA47"),
    universalRouter: getAddress("0xd6145b2D3F379919E8CdEda7B97e37c4b2Ca9c40"),
    permit2: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  },
};

/** Native ETH is currency address(0) in v4. */
export const NATIVE: Address = zeroAddress;

/** v4-periphery Actions.sol */
export const Actions = {
  INCREASE_LIQUIDITY: 0x00,
  DECREASE_LIQUIDITY: 0x01,
  MINT_POSITION: 0x02,
  BURN_POSITION: 0x03,
  SWAP_EXACT_IN_SINGLE: 0x06,
  SWAP_EXACT_IN: 0x07,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
  SWEEP: 0x14,
} as const;

/** Universal Router Commands.sol */
export const Commands = { V4_SWAP: 0x10 } as const;

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

const POOL_KEY =
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";

/** Sorts two currencies into a PoolKey (currency0 < currency1; native ETH is 0x0, so it sorts first). */
export function poolKey(
  a: Address,
  b: Address,
  fee: number,
  tickSpacing: number,
  hooks: Address = zeroAddress
): PoolKey {
  if (a.toLowerCase() === b.toLowerCase())
    throw new Error("A v4 pool needs two different currencies");
  const [currency0, currency1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return {
    currency0: getAddress(currency0),
    currency1: getAddress(currency1),
    fee,
    tickSpacing,
    hooks: getAddress(hooks),
  };
}

/** PoolId = keccak256(abi.encode(PoolKey)). */
export function poolId(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters(POOL_KEY), [key]));
}

/** Common hook-less fee tiers and their usual tick spacing. */
export const V4_TIERS = [
  { fee: 100, tickSpacing: 1 },
  { fee: 500, tickSpacing: 10 },
  { fee: 3000, tickSpacing: 60 },
  { fee: 10_000, tickSpacing: 200 },
] as const;

// ── Pool data (StateView) ────────────────────────────────────────────────────────────────────

export const stateViewAbi = parseAbi([
  "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
  "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
  "function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)",
]);

// ── Quotes (V4Quoter) ────────────────────────────────────────────────────────────────────────

export const quoterAbi = parseAbi([
  `function quoteExactInputSingle((${POOL_KEY} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
  "function quoteExactInput((address exactCurrency, (address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint128 exactAmount) params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

export interface PathKey {
  intermediateCurrency: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
  hookData: Hex;
}

// ── Swaps (Universal Router 2.1.x, V4_SWAP) ──────────────────────────────────────────────────

export const universalRouterAbi = parseAbi([
  "function execute(bytes commands, bytes[] inputs, uint256 deadline) payable",
]);

const EXACT_IN_SINGLE = `(${POOL_KEY} poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)`;
const EXACT_IN =
  "(address currencyIn, (address intermediateCurrency, uint24 fee, int24 tickSpacing, address hooks, bytes hookData)[] path, uint256[] minHopPriceX36, uint128 amountIn, uint128 amountOutMinimum)";

const actionBytes = (actions: number[]) => concat(actions.map((a) => toHex(a, { size: 1 })));
const v4SwapInput = (actions: number[], params: Hex[]) =>
  encodeAbiParameters(parseAbiParameters("bytes actions, bytes[] params"), [
    actionBytes(actions),
    params,
  ]);
const settleAll = (currency: Address, maxAmount: bigint) =>
  encodeAbiParameters(parseAbiParameters("address currency, uint256 maxAmount"), [
    currency,
    maxAmount,
  ]);
const takeAll = (currency: Address, minAmount: bigint) =>
  encodeAbiParameters(parseAbiParameters("address currency, uint256 minAmount"), [
    currency,
    minAmount,
  ]);

export interface SingleSwap {
  key: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
  hookData?: Hex;
}

/** Exact-input swap through one pool: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL. */
export function singleSwapCall(chainId: V4ChainId, s: SingleSwap) {
  const [currencyIn, currencyOut] = s.zeroForOne
    ? [s.key.currency0, s.key.currency1]
    : [s.key.currency1, s.key.currency0];
  const swap = encodeAbiParameters(parseAbiParameters(EXACT_IN_SINGLE), [
    {
      poolKey: s.key,
      zeroForOne: s.zeroForOne,
      amountIn: s.amountIn,
      amountOutMinimum: s.amountOutMinimum,
      minHopPriceX36: 0n,
      hookData: s.hookData ?? "0x",
    },
  ]);
  const input = v4SwapInput(
    [Actions.SWAP_EXACT_IN_SINGLE, Actions.SETTLE_ALL, Actions.TAKE_ALL],
    [swap, settleAll(currencyIn, s.amountIn), takeAll(currencyOut, s.amountOutMinimum)]
  );
  return {
    address: V4[chainId].universalRouter,
    abi: universalRouterAbi,
    functionName: "execute" as const,
    args: [toHex(Commands.V4_SWAP, { size: 1 }), [input], s.deadline] as const,
    value: currencyIn === NATIVE ? s.amountIn : 0n,
  };
}

export interface MultiSwap {
  currencyIn: Address;
  path: PathKey[];
  amountIn: bigint;
  amountOutMinimum: bigint;
  deadline: bigint;
}

/** Exact-input swap across several pools: SWAP_EXACT_IN, SETTLE_ALL, TAKE_ALL. */
export function multiSwapCall(chainId: V4ChainId, s: MultiSwap) {
  const currencyOut = s.path[s.path.length - 1]?.intermediateCurrency;
  if (!currencyOut) throw new Error("A multi-hop swap needs at least one hop");
  const swap = encodeAbiParameters(parseAbiParameters(EXACT_IN), [
    {
      currencyIn: s.currencyIn,
      path: s.path,
      minHopPriceX36: [],
      amountIn: s.amountIn,
      amountOutMinimum: s.amountOutMinimum,
    },
  ]);
  const input = v4SwapInput(
    [Actions.SWAP_EXACT_IN, Actions.SETTLE_ALL, Actions.TAKE_ALL],
    [swap, settleAll(s.currencyIn, s.amountIn), takeAll(currencyOut, s.amountOutMinimum)]
  );
  return {
    address: V4[chainId].universalRouter,
    abi: universalRouterAbi,
    functionName: "execute" as const,
    args: [toHex(Commands.V4_SWAP, { size: 1 }), [input], s.deadline] as const,
    value: s.currencyIn === NATIVE ? s.amountIn : 0n,
  };
}

// ── Permit2 (ERC-20 inputs) ──────────────────────────────────────────────────────────────────

export const permit2Abi = parseAbi([
  "function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)",
  "function approve(address token, address spender, uint160 amount, uint48 expiration)",
]);
export const MAX_UINT160 = (1n << 160n) - 1n;

// ── Liquidity (PositionManager.modifyLiquidities) ────────────────────────────────────────────

export const positionManagerAbi = parseAbi([
  "function modifyLiquidities(bytes unlockData, uint256 deadline) payable",
  "function getPoolAndPositionInfo(uint256 tokenId) view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 info)",
  "function getPositionLiquidity(uint256 tokenId) view returns (uint128 liquidity)",
  "function nextTokenId() view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function initializePool((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) payable returns (int24)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
]);

const unlockData = (actions: number[], params: Hex[]) =>
  encodeAbiParameters(parseAbiParameters("bytes actions, bytes[] params"), [
    actionBytes(actions),
    params,
  ]);
const pair = (key: PoolKey) => [key.currency0, key.currency1] as const;
const nativeIn = (key: PoolKey, amount0: bigint) => (key.currency0 === NATIVE ? amount0 : 0n);

export interface MintParams {
  key: PoolKey;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  amount0Max: bigint;
  amount1Max: bigint;
  owner: Address;
  deadline: bigint;
  hookData?: Hex;
}

/** MINT_POSITION + SETTLE_PAIR (+ SWEEP of unused native ETH back to the owner). */
export function mintCall(chainId: V4ChainId, m: MintParams) {
  const actions: number[] = [Actions.MINT_POSITION, Actions.SETTLE_PAIR];
  const params: Hex[] = [
    encodeAbiParameters(
      parseAbiParameters(
        `${POOL_KEY} poolKey, int24 tickLower, int24 tickUpper, uint256 liquidity, uint128 amount0Max, uint128 amount1Max, address owner, bytes hookData`
      ),
      [
        m.key,
        m.tickLower,
        m.tickUpper,
        m.liquidity,
        m.amount0Max,
        m.amount1Max,
        m.owner,
        m.hookData ?? "0x",
      ]
    ),
    encodeAbiParameters(parseAbiParameters("address currency0, address currency1"), pair(m.key)),
  ];
  if (m.key.currency0 === NATIVE) {
    actions.push(Actions.SWEEP);
    params.push(
      encodeAbiParameters(parseAbiParameters("address currency, address to"), [NATIVE, m.owner])
    );
  }
  return modify(chainId, actions, params, m.deadline, nativeIn(m.key, m.amount0Max));
}

export interface ChangeParams {
  tokenId: bigint;
  key: PoolKey;
  liquidity: bigint;
  amount0: bigint;
  amount1: bigint;
  recipient: Address;
  deadline: bigint;
  hookData?: Hex;
}

/** INCREASE_LIQUIDITY + SETTLE_PAIR (+ SWEEP). amount0/amount1 are maximums. */
export function increaseCall(chainId: V4ChainId, c: ChangeParams) {
  const actions: number[] = [Actions.INCREASE_LIQUIDITY, Actions.SETTLE_PAIR];
  const params: Hex[] = [
    encodeAbiParameters(
      parseAbiParameters(
        "uint256 tokenId, uint256 liquidity, uint128 amount0Max, uint128 amount1Max, bytes hookData"
      ),
      [c.tokenId, c.liquidity, c.amount0, c.amount1, c.hookData ?? "0x"]
    ),
    encodeAbiParameters(parseAbiParameters("address currency0, address currency1"), pair(c.key)),
  ];
  if (c.key.currency0 === NATIVE) {
    actions.push(Actions.SWEEP);
    params.push(
      encodeAbiParameters(parseAbiParameters("address currency, address to"), [NATIVE, c.recipient])
    );
  }
  return modify(chainId, actions, params, c.deadline, nativeIn(c.key, c.amount0));
}

/** DECREASE_LIQUIDITY + TAKE_PAIR. amount0/amount1 are minimums. liquidity 0 collects fees only. */
export function decreaseCall(chainId: V4ChainId, c: ChangeParams) {
  return modify(
    chainId,
    [Actions.DECREASE_LIQUIDITY, Actions.TAKE_PAIR],
    [
      encodeAbiParameters(
        parseAbiParameters(
          "uint256 tokenId, uint256 liquidity, uint128 amount0Min, uint128 amount1Min, bytes hookData"
        ),
        [c.tokenId, c.liquidity, c.amount0, c.amount1, c.hookData ?? "0x"]
      ),
      encodeAbiParameters(
        parseAbiParameters("address currency0, address currency1, address recipient"),
        [...pair(c.key), c.recipient]
      ),
    ],
    c.deadline,
    0n
  );
}

/** Collect fees: a zero-liquidity decrease, then take both currencies. */
export const collectFeesCall = (
  chainId: V4ChainId,
  c: Omit<ChangeParams, "liquidity" | "amount0" | "amount1">
) => decreaseCall(chainId, { ...c, liquidity: 0n, amount0: 0n, amount1: 0n });

function modify(
  chainId: V4ChainId,
  actions: number[],
  params: Hex[],
  deadline: bigint,
  value: bigint
) {
  return {
    address: V4[chainId].positionManager,
    abi: positionManagerAbi,
    functionName: "modifyLiquidities" as const,
    args: [unlockData(actions, params), deadline] as const,
    value,
  };
}

/** Pool creation: PositionManager.initializePool(key, sqrtPriceX96). */
export function createPoolCall(chainId: V4ChainId, key: PoolKey, sqrtPriceX96: bigint) {
  return {
    address: V4[chainId].positionManager,
    abi: positionManagerAbi,
    functionName: "initializePool" as const,
    args: [key, sqrtPriceX96] as const,
    value: 0n,
  };
}

/**
 * PositionInfo packs (from the low bit): hasSubscriber (8 bits), tickLower (24), tickUpper (24),
 * then the pool id prefix (200). v4-periphery PositionInfoLibrary.
 */
export function decodePositionInfo(info: bigint) {
  const signed24 = (v: bigint) => Number(v >= 1n << 23n ? v - (1n << 24n) : v);
  return {
    hasSubscriber: (info & 0xffn) !== 0n,
    tickLower: signed24((info >> 8n) & 0xffffffn),
    tickUpper: signed24((info >> 32n) & 0xffffffn),
  };
}

/** Calldata for the ERC-20 → Permit2 → router approval chain, for display and tests. */
export const erc20ApproveAbi = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);
export const encodeErc20Approve = (spender: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [spender, amount] });
