// src/lib/staked-positions.ts
import { type Address, getAddress, parseAbi, zeroAddress } from "viem";

import { USDC_ADDRESS, WETH_ADDRESS } from "@/config/dex-venues";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { CONTRACTS } from "@/lib/contracts";
import { MRWD, MRWD_PRO_STAKING } from "@/lib/mrwd-pro";
import { MRWD_V3_STAKER } from "@/lib/mrwd-staker";

const NPM: Address = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const V3_TIMELOCK: Address = "0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25";
const V3_FACTORY: Address = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
const EQX: Address = "0x1aEB45Fd7B6C59B52da3e41558410F306CBaa56C";
const EQX_VESTING: Address = "0x20FE2fde9CA8fe7cD6911770CDc28db73D996E6A";
/** Large enough that a few hundred reads travel in a handful of RPC requests. */
const MULTICALL_BYTES = 32_768;

const npmAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
]);
const factoryAbi = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)",
]);
const stakerAbi = parseAbi([
  "function deposits(uint256 tokenId) view returns (address owner, uint48 numberOfStakes, int24 tickLower, int24 tickUpper)",
]);
const timelockAbi = parseAbi([
  "function getLock(uint256 tokenId) view returns (address owner, uint256 unlockTimestamp, uint256 lockedAt, bool isLockedActive)",
]);
const vestingAbi = parseAbi(["function beneficiary() view returns (address)"]);
const stakeAbi = parseAbi([
  "function stakedBalance(address user) view returns (uint256)",
  "function stakedOf(address user) view returns (uint256)",
  "function sharesOf(address user) view returns (uint256)",
  "function token() view returns (address)",
  "function underlyingAsset() view returns (address)",
]);
const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
]);

interface MulticallResult {
  status: "success" | "failure";
  result?: unknown;
}

export interface PositionReader {
  readContract: (request: never) => Promise<unknown>;
  multicall: (request: never) => Promise<MulticallResult[]>;
}

export type PositionCustody = "wallet" | "staker" | "timelock";

export interface V3Position {
  tokenId: string;
  custody: PositionCustody;
  token0: Address;
  token1: Address;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  fee: number;
  pool: Address;
  tickLower: number;
  tickUpper: number;
  /** Text, so positions stay serializable in the query cache. */
  liquidity: string;
}

export interface StakedToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Where it is staked, such as "2 LP positions" or "Staking". */
  sources: string[];
}

export interface StakedPortfolio {
  positions: V3Position[];
  tokens: StakedToken[];
  /** True when a read failed, so the lists may be missing entries. */
  incomplete: boolean;
}

export interface StakingSource {
  address: Address;
  kind: "staking" | "pro-staking" | "vault";
}

const read = (client: PositionReader, contracts: readonly unknown[]) =>
  contracts.length
    ? client.multicall({
        contracts,
        allowFailure: true,
        batchSize: MULTICALL_BYTES,
      } as never)
    : Promise.resolve([] as MulticallResult[]);

/** The position NFTs one address holds, read by index so no event logs are needed. */
async function heldTokenIds(client: PositionReader, holder: Address) {
  const count = (await client.readContract({
    address: NPM,
    abi: npmAbi,
    functionName: "balanceOf",
    args: [holder],
  } as never)) as bigint;
  const results = await read(
    client,
    Array.from({ length: Number(count) }, (_, index) => ({
      address: NPM,
      abi: npmAbi,
      functionName: "tokenOfOwnerByIndex",
      args: [holder, BigInt(index)],
    }))
  );
  return {
    ids: results.flatMap((r) => (r.status === "success" ? [r.result as bigint] : [])),
    failed: results.some((r) => r.status === "failure"),
  };
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Custody contracts hold everyone's NFTs, so keep those each one records for this owner. */
async function ownedThrough(
  client: PositionReader,
  owner: Address,
  custody: Exclude<PositionCustody, "wallet">
) {
  const holder = custody === "staker" ? MRWD_V3_STAKER : V3_TIMELOCK;
  const { ids, failed } = await heldTokenIds(client, holder);
  const results = await read(
    client,
    ids.map((id) =>
      custody === "staker"
        ? { address: holder, abi: stakerAbi, functionName: "deposits", args: [id] }
        : { address: holder, abi: timelockAbi, functionName: "getLock", args: [id] }
    )
  );
  const mine = ids.filter((_, index) => {
    const result = results[index];
    if (result?.status !== "success") return false;
    return sameAddress((result.result as readonly [Address])[0], owner);
  });
  return { ids: mine, failed: failed || results.some((r) => r.status === "failure") };
}

export async function discoverV3Positions(client: PositionReader, owner: Address) {
  const [wallet, staker, timelock] = await Promise.all([
    heldTokenIds(client, owner),
    ownedThrough(client, owner, "staker"),
    ownedThrough(client, owner, "timelock"),
  ]);
  const held: Array<{ id: bigint; custody: PositionCustody }> = [
    ...wallet.ids.map((id) => ({ id, custody: "wallet" as const })),
    ...staker.ids.map((id) => ({ id, custody: "staker" as const })),
    ...timelock.ids.map((id) => ({ id, custody: "timelock" as const })),
  ];
  const details = await read(
    client,
    held.map(({ id }) => ({
      address: NPM,
      abi: npmAbi,
      functionName: "positions",
      args: [id],
    }))
  );
  const rows = held.flatMap(({ id, custody }, index) => {
    const detail = details[index];
    if (detail?.status !== "success") return [];
    const row = detail.result as readonly [
      bigint,
      Address,
      Address,
      Address,
      number,
      number,
      number,
      bigint,
    ];
    return [{ tokenId: id.toString(), custody, row }];
  });
  const [metadata, pools] = await Promise.all([
    describeTokens(client, [...new Set(rows.flatMap(({ row }) => [row[2], row[3]]))]),
    read(
      client,
      rows.map(({ row }) => ({
        address: V3_FACTORY,
        abi: factoryAbi,
        functionName: "getPool",
        args: [row[2], row[3], row[4]],
      }))
    ),
  ]);
  // A token that won't describe itself still shows, by its address, rather than vanishing.
  const shortName = (token: Address) => `${token.slice(0, 6)}…${token.slice(-4)}`;
  const positions = rows.map(({ tokenId, custody, row }, index): V3Position => {
    const info0 = metadata.get(row[2].toLowerCase());
    const info1 = metadata.get(row[3].toLowerCase());
    const pool = pools[index];
    return {
      tokenId,
      custody,
      token0: row[2],
      token1: row[3],
      token0Symbol: info0?.symbol ?? shortName(row[2]),
      token1Symbol: info1?.symbol ?? shortName(row[3]),
      token0Decimals: info0?.decimals ?? 18,
      token1Decimals: info1?.decimals ?? 18,
      fee: row[4],
      pool: pool?.status === "success" ? (pool.result as Address) : zeroAddress,
      tickLower: row[5],
      tickUpper: row[6],
      liquidity: row[7].toString(),
    };
  });
  return {
    positions,
    incomplete:
      wallet.failed ||
      staker.failed ||
      timelock.failed ||
      details.some((d) => d.status === "failure") ||
      pools.some((p) => p.status === "failure"),
  };
}

const QUOTE_TOKENS = [WETH_ADDRESS, USDC_ADDRESS] as readonly string[];

/** The side of a pair worth listing: its project token, or WETH for a WETH/USDC position. */
export function stakedSideOf(position: Pick<V3Position, "token0" | "token1">): Address {
  const isQuote = (token: Address) => QUOTE_TOKENS.some((quote) => sameAddress(quote, token));
  if (!isQuote(position.token0)) return position.token0;
  if (!isQuote(position.token1)) return position.token1;
  return sameAddress(position.token0, WETH_ADDRESS) ? position.token0 : position.token1;
}

const BALANCE_READ: Record<StakingSource["kind"], "stakedBalance" | "stakedOf" | "sharesOf"> = {
  staking: "stakedBalance",
  "pro-staking": "stakedOf",
  vault: "sharesOf",
};

const SOURCE_LABEL: Record<StakingSource["kind"], string> = {
  staking: "Staking",
  "pro-staking": "Pro staking",
  vault: "Vault",
};

/** Everything this app can stake into: protocol contracts plus the wallet's own launches. */
export function knownStakingSources(launches: Array<{
  stakingAddress?: Address | undefined;
  vaultAddress?: Address | undefined;
  compoundVaultAddress?: Address | undefined;
}>): StakingSource[] {
  const base = CONTRACTS[8453]!;
  const sources: StakingSource[] = [
    { address: base.FeeDiscountStaking, kind: "staking" },
    { address: MRWD_PRO_STAKING, kind: "pro-staking" },
    ...[base.YieldStakingVault, base.CompoundYieldVault].flatMap((address) =>
      address ? [{ address, kind: "vault" as const }] : []
    ),
    ...launches.flatMap((launch) => [
      ...(launch.stakingAddress
        ? [{ address: launch.stakingAddress, kind: "staking" as const }]
        : []),
      ...[launch.vaultAddress, launch.compoundVaultAddress].flatMap((address) =>
        address ? [{ address, kind: "vault" as const }] : []
      ),
    ]),
  ];
  const seen = new Set<string>();
  return sources.filter(({ address }) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function activeStakes(client: PositionReader, owner: Address, sources: StakingSource[]) {
  const balances = await read(
    client,
    sources.map(({ address, kind }) => ({
      address,
      abi: stakeAbi,
      functionName: BALANCE_READ[kind],
      args: [owner],
    }))
  );
  const active = sources.filter((_, index) => {
    const balance = balances[index];
    return balance?.status === "success" && (balance.result as bigint) > 0n;
  });
  const assets = await read(
    client,
    active.map(({ address, kind }) => ({
      address,
      abi: stakeAbi,
      functionName: kind === "vault" ? "underlyingAsset" : "token",
    }))
  );
  // MuttProStaking exposes its token under another name, so fall back to the known address.
  const stakes = active.flatMap((source, index) => {
    const asset = assets[index];
    if (asset?.status === "success") return [{ source, token: asset.result as Address }];
    return source.kind === "pro-staking" ? [{ source, token: MRWD }] : [];
  });
  return {
    stakes,
    // A contract from an older launch may not support a read, so only a token lookup is a miss.
    incomplete: stakes.length < active.length,
  };
}

async function describeTokens(client: PositionReader, addresses: Address[]) {
  const configured = new Map<string, { symbol: string; name: string; decimals: number }>(
    BASE_MAINNET_TOKENS.filter((t) => t.kind === "erc20").map((t) => [
      t.address.toLowerCase(),
      t,
    ])
  );
  const unknown = addresses.filter((a) => !configured.has(a.toLowerCase()));
  const results = await read(
    client,
    unknown.flatMap((address) =>
      (["symbol", "name", "decimals"] as const).map((functionName) => ({
        address,
        abi: erc20Abi,
        functionName,
      }))
    )
  );
  unknown.forEach((address, index) => {
    const [symbol, name, decimals] = results.slice(index * 3, index * 3 + 3);
    if (
      symbol?.status === "success" &&
      name?.status === "success" &&
      decimals?.status === "success"
    ) {
      configured.set(address.toLowerCase(), {
        symbol: String(symbol.result).trim(),
        name: String(name.result).trim(),
        decimals: Number(decimals.result),
      });
    }
  });
  return configured;
}

export async function discoverStakedPortfolio(
  client: PositionReader,
  owner: Address,
  sources: StakingSource[]
): Promise<StakedPortfolio> {
  const [{ positions, incomplete: positionsIncomplete }, stakes, vesting] = await Promise.all([
    discoverV3Positions(client, owner),
    activeStakes(client, owner, sources),
    read(client, [{ address: EQX_VESTING, abi: vestingAbi, functionName: "beneficiary" }]),
  ]);
  const found = new Map<string, Map<string, number>>();
  const add = (token: Address, source: string) => {
    const key = getAddress(token);
    const counts = found.get(key) ?? new Map<string, number>();
    counts.set(source, (counts.get(source) ?? 0) + 1);
    found.set(key, counts);
  };
  for (const position of positions) {
    if (position.custody === "staker") add(stakedSideOf(position), "LP staked");
    if (position.custody === "timelock") add(stakedSideOf(position), "LP locked");
  }
  for (const { source, token } of stakes.stakes) add(token, SOURCE_LABEL[source.kind]);
  const beneficiary = vesting[0];
  if (beneficiary?.status === "success" && sameAddress(beneficiary.result as Address, owner)) {
    add(EQX, "Vesting");
  }

  const addresses = [...found.keys()] as Address[];
  const metadata = await describeTokens(client, addresses);
  const tokens = addresses.flatMap((address): StakedToken[] => {
    const info = metadata.get(address.toLowerCase());
    if (!info) return [];
    const sourceList = [...(found.get(address)?.entries() ?? [])].map(([label, count]) =>
      count > 1 ? `${label} ×${count}` : label
    );
    return [{ address, ...info, sources: sourceList }];
  });
  return {
    positions,
    tokens,
    incomplete:
      positionsIncomplete ||
      stakes.incomplete ||
      beneficiary?.status !== "success" ||
      tokens.length < addresses.length,
  };
}
