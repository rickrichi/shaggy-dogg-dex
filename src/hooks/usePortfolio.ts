// src/hooks/usePortfolio.ts
import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";
import { type Address, formatUnits } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { tokenWatchlistForChain } from "@/lib/tokens";

/* ============ Types ============ */
export interface Token {
  key: string; // stable React key
  symbol: string;
  name: string;
  address: Address | "0x0000000000000000000000000000000000000000";
  decimals: number;
  chainId: number;
  balance: string; // bigint as string
  balanceFormatted: string; // human readable
  usdValue: number;
  priceUsd: number;
  logo?: string; // optional; when present must be string (never undefined)
}
export interface PortfolioSummary {
  totalValue: number;
  totalTokens: number;
  topChain: string;
  biggestHolding: Token | null;
  percentChange24h: number;
}
export interface UsePortfolioReturn {
  [x: string]: unknown;
  tokens: Token[];
  summary: PortfolioSummary;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/* ============ Inputs from watchlist/prices ============ */
interface WatchlistToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logo?: string;
}
interface Watchlist {
  chainName: string;
  tokens: readonly WatchlistToken[];
}
interface SimplePrice {
  usd: number;
  usd_24h_change?: number | undefined; // Explicitly allow undefined
}
interface ApiPricesResponse {
  native: { symbol: string; usd: number; usd_24h_change?: number | undefined }; // Explicitly allow undefined
  tokens: Record<string, SimplePrice>; // keys: lowercase addresses
}

/* ============ ERC-20 ABI ============ */
const ERC20_BALANCEOF = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/* ============ Helpers & Type Guards ============ */
function nativeMeta(chainId: number): { symbol: string; decimals: number; name: string } {
  switch (chainId) {
    case 1:
      return { symbol: "ETH", decimals: 18, name: "Ethereum" };
    case 137:
      return { symbol: "MATIC", decimals: 18, name: "Polygon" };
    case 10:
      return { symbol: "ETH", decimals: 18, name: "Optimism" };
    case 42161:
      return { symbol: "ETH", decimals: 18, name: "Arbitrum" };
    case 8453:
      return { symbol: "ETH", decimals: 18, name: "Base" };
    case 11155111:
      return { symbol: "ETH", decimals: 18, name: "Sepolia" };
    default:
      return { symbol: "ETH", decimals: 18, name: "Ethereum" };
  }
}
function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null;
}
function isNumber(u: unknown): u is number {
  return typeof u === "number" && Number.isFinite(u);
}
function isString(u: unknown): u is string {
  return typeof u === "string";
}
function isHexAddress(u: unknown): u is Address {
  return isString(u) && /^0x[0-9a-fA-F]{40}$/.test(u);
}

/** Coerce arbitrary watchlist data into a strong Watchlist shape. */
function coerceWatchlist(chainId: number): Watchlist {
  const raw = tokenWatchlistForChain(chainId) as unknown;
  let chainName = "Unknown";
  const tokens: WatchlistToken[] = [];

  if (isRecord(raw)) {
    const cn = raw["chainName"];
    if (isString(cn)) chainName = cn;

    const toks = (raw as Record<string, unknown>)["tokens"];
    if (Array.isArray(toks)) {
      for (const x of toks) {
        const t = coerceWatchlistToken(x);
        if (t) tokens.push(t);
      }
    }
  }
  return { chainName, tokens };
}

function coerceWatchlistToken(u: unknown): WatchlistToken | null {
  if (!isRecord(u)) return null;

  const address = u["address"];
  const symbol = u["symbol"];
  const name = u["name"] ?? u["label"];
  const decimals = u["decimals"] ?? u["decimal"] ?? u["dec"];
  const logo = u["logo"];

  if (!isHexAddress(address) || !isString(symbol) || !isString(name)) return null;

  let dec = 18;
  if (isNumber(decimals)) dec = decimals;

  return {
    address,
    symbol,
    name,
    decimals: dec,
    ...(isString(logo) ? { logo } : {}),
  };
}

/** Parse API prices response into a strongly-typed object (no unsafe casts). */
function parseApiPricesResponse(u: unknown): ApiPricesResponse {
  if (!isRecord(u)) throw new Error("prices: not an object");

  const natU = u["native"];
  const toksU = u["tokens"];
  if (!isRecord(natU)) throw new Error("prices.native missing");
  if (!isRecord(toksU)) throw new Error("prices.tokens missing");

  const usd = natU["usd"];
  const chg = natU["usd_24h_change"];
  const sym = natU["symbol"];
  if (!isNumber(usd)) throw new Error("prices.native.usd missing");
  if (chg !== undefined && !isNumber(chg)) throw new Error("prices.native.usd_24h_change bad");

  const native = {
    symbol: isString(sym) ? sym : "NATIVE",
    usd,
    usd_24h_change: chg as number | undefined,
  };

  const tokens: Record<string, SimplePrice> = {};
  for (const [k, v] of Object.entries(toksU)) {
    if (!isRecord(v)) continue;
    const vu = v["usd"];
    const vc = v["usd_24h_change"];
    if (!isNumber(vu)) continue;
    tokens[k.toLowerCase()] = {
      usd: vu,
      usd_24h_change: isNumber(vc) ? vc : undefined,
    };
  }

  return { native, tokens };
}

function maxBy<T>(xs: readonly T[], f: (x: T) => number): T | null {
  let best: { v: T; s: number } | null = null;
  for (const v of xs) {
    const s = f(v);
    if (best === null || s > best.s) best = { v, s };
  }
  return best?.v ?? null;
}

/* ============ Hook ============ */
export function usePortfolio(): UsePortfolioReturn {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

  const { data, isLoading, error, refetch } = useQuery<{
    tokens: Token[];
    summary: PortfolioSummary;
  }>({
    queryKey: ["portfolio", address, chainId],
    enabled: Boolean(isConnected && address && publicClient && Number.isFinite(chainId)),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!address || !publicClient || !Number.isFinite(chainId)) {
        throw new Error("Wallet/network not ready");
      }

      // 1) Watchlist for active chain (strictly coerced)
      const watch = coerceWatchlist(chainId);
      const list = watch.tokens;

      // 2) Balances (native + ERC-20 multicall with fallback)
      const native = nativeMeta(chainId);
      let nativeBal = 0n;
      try {
        nativeBal = await publicClient.getBalance({ address });
      } catch (e) {
        console.warn("Failed to get native balance via publicClient:", e);
      }

      let ercBalances: readonly bigint[] = [];
      if (list.length > 0) {
        try {
          const calls = list.map((t) => ({
            address: t.address,
            abi: ERC20_BALANCEOF,
            functionName: "balanceOf" as const,
            args: [address],
          }));
          const results = await publicClient.multicall({ contracts: calls, allowFailure: true });
          ercBalances = results.map((r) =>
            r && typeof r === "object" && "status" in r && r.status === "success"
              ? (r.result as bigint)
              : 0n
          );
        } catch (e) {
          console.warn("Multicall failed, falling back to individual calls:", e);
          const singleCalls = await Promise.all(
            list.map(async (t) => {
              try {
                return (await publicClient.readContract({
                  address: t.address,
                  abi: ERC20_BALANCEOF,
                  functionName: "balanceOf",
                  args: [address],
                })) as bigint;
              } catch {
                return 0n;
              }
            })
          );
          ercBalances = singleCalls;
        }
      }

      // 3) Prices via the API server with graceful fallback (never blocks portfolio display)
      let prices: ApiPricesResponse = {
        native: { symbol: native.symbol, usd: 2500, usd_24h_change: 0 },
        tokens: {},
      };
      try {
        const contracts = list.map((t) => t.address).join(",");
        const qs = new URLSearchParams({ chainId: String(chainId) });
        if (contracts) qs.set("contracts", contracts);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`/api/prices?${qs.toString()}`, {
          headers: { accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (res.ok) {
          prices = parseApiPricesResponse(await res.json());
        }
      } catch (e) {
        console.info("Price server warming up, using graceful fallback for portfolio:", e);
      }

      // 4) Tokens array
      const rows: Token[] = [];

      // Native row
      const natFormatted = formatUnits(nativeBal, native.decimals);
      const natPrice = prices.native.usd ?? 0;
      rows.push({
        key: `native:${chainId}`,
        symbol: native.symbol,
        name: native.name,
        address: "0x0000000000000000000000000000000000000000",
        decimals: native.decimals,
        chainId,
        balance: nativeBal.toString(),
        balanceFormatted: natFormatted,
        usdValue: natPrice * Number(natFormatted),
        priceUsd: natPrice,
      });

      // ERC-20 rows (respect noUncheckedIndexedAccess by iterating entries)
      for (const [i, t] of list.entries()) {
        const bal = ercBalances[i] ?? 0n;
        const formatted = formatUnits(bal, t.decimals);
        const tokenKey = (t.address as string).toLowerCase();
        const quote = prices.tokens[tokenKey];
        const px = quote?.usd ?? 0;

        rows.push({
          key: `${t.symbol}:${t.address}:${chainId}`,
          symbol: t.symbol,
          name: t.name,
          address: t.address,
          decimals: t.decimals,
          chainId,
          balance: bal.toString(),
          balanceFormatted: formatted,
          usdValue: px * Number(formatted),
          priceUsd: px,
          ...(t.logo ? { logo: t.logo } : {}), // omit when undefined (exactOptionalPropertyTypes)
        });
      }

      // 5) Summary & 24h %
      const totalValue = rows.reduce((s, r) => s + r.usdValue, 0);

      const nativeDeltaUsd =
        ((prices.native.usd_24h_change ?? 0) / 100) * natPrice * Number(natFormatted);

      const zero = "0x0000000000000000000000000000000000000000" as const;
      const ercDeltaUsd = rows.reduce((s, r) => {
        if (r.address === zero) return s;
        const key = (r.address as string).toLowerCase();
        const pct = (prices.tokens[key]?.usd_24h_change ?? 0) / 100;
        return s + pct * r.usdValue;
      }, 0);

      const totalDelta24hUsd = nativeDeltaUsd + ercDeltaUsd;
      const denom = totalValue - totalDelta24hUsd;
      const percentChange24h = denom > 0 ? (totalDelta24hUsd / denom) * 100 : 0;

      return {
        tokens: rows,
        summary: {
          totalValue,
          totalTokens: rows.length,
          topChain: watch.chainName,
          biggestHolding: maxBy(rows, (r) => r.usdValue),
          percentChange24h,
        },
      };
    },
  });

  const fallbackSummary: PortfolioSummary = useMemo(
    () => ({
      totalValue: 0,
      totalTokens: 0,
      topChain: coerceWatchlist(chainId).chainName,
      biggestHolding: null,
      percentChange24h: 0,
    }),
    [chainId]
  );

  return {
    tokens: data?.tokens ?? [],
    summary: data?.summary ?? fallbackSummary,
    isLoading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
    refetch,
  };
}
