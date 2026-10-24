import { type Abi, type Address, encodeFunctionData, type PublicClient } from "viem";

import {
  AERODROME_ROUTER_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V3_SWAP_ROUTER_02_ABI,
} from "@/config/abis";
import {
  getChainUsdcAddress,
  getUniswapV2Router,
  getUniswapV3Deployment,
  UNISWAP_V3,
  UNISWAP_V3_QUOTER_V2_BASE,
} from "@/config/contracts";
import { getWrappedNativeAddress, type Token } from "@/config/tokens";

import { encodeV3Path } from "./bot-market-snapshot";
import { V3_FEE_TIERS } from "./uniswap-v3";

export const AERODROME_ROUTER: Address = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
export const AERODROME_FACTORY: Address = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
export interface SmartRoute {
  venue: "Uniswap V3" | "Uniswap V2" | "Aerodrome";
  router: Address;
  path: Address[];
  stable: boolean[];
  /** Fee of a single-hop V3 route. */
  fee?: number;
  /** One fee per hop of a multi-hop V3 route. */
  fees?: number[];
}
/** Per-hop V3 fees, whether the route is single- or multi-hop. */
export const v3RouteFees = (route: SmartRoute): number[] => route.fees ?? [route.fee ?? 3000];
const isV3Fee = (fee: number) => V3_FEE_TIERS.some((tier) => tier.fee === fee);
export const aeroRoutes = (route: SmartRoute) =>
  route.path.slice(0, -1).map((from, i) => ({
    from,
    to: route.path[i + 1]!,
    stable: route.stable[i] ?? false,
    factory: AERODROME_FACTORY,
  }));
export function routeCandidates(sell: Token, buy: Token): SmartRoute[] {
  if (sell.chainId !== buy.chainId) return [];
  const wrapped = getWrappedNativeAddress(sell.chainId);
  const usdc = getChainUsdcAddress(sell.chainId);
  const from = sell.address === "native" ? wrapped : sell.address;
  const to = buy.address === "native" ? wrapped : buy.address;
  if (from.toLowerCase() === to.toLowerCase()) return [];
  const paths: Address[][] = [[from, to]];
  for (const mid of [wrapped, ...(usdc ? [usdc] : [])]) {
    if (from.toLowerCase() !== mid.toLowerCase() && to.toLowerCase() !== mid.toLowerCase()) {
      paths.push([from, mid, to]);
    }
  }
  const v3 = getUniswapV3Deployment(sell.chainId);
  return paths.flatMap((path) => {
    const uniV2: SmartRoute = {
      venue: "Uniswap V2",
      router: getUniswapV2Router(sell.chainId),
      path,
      stable: [],
    };
    const uniV3: SmartRoute[] = !v3
      ? []
      : path.length === 2
        ? V3_FEE_TIERS.map(({ fee }) => ({
            venue: "Uniswap V3" as const,
            router: v3.router,
            path,
            stable: [],
            fee,
          }))
        : V3_FEE_TIERS.flatMap(({ fee: first }) =>
            V3_FEE_TIERS.map(({ fee: second }) => ({
              venue: "Uniswap V3" as const,
              router: v3.router,
              path,
              stable: [],
              fees: [first, second],
            }))
          );
    const aero: SmartRoute[] =
      sell.chainId === 8453
        ? Array.from(
            { length: 2 ** (path.length - 1) },
            (_, mask): SmartRoute => ({
              venue: "Aerodrome",
              router: AERODROME_ROUTER,
              path,
              stable: path.slice(1).map((_, i) => Boolean(mask & (1 << i))),
            })
          )
        : [];
    return [...uniV3, uniV2, ...aero];
  });
}
export function routeQuoteCall(route: SmartRoute, amount: bigint) {
  if (route.venue === "Uniswap V3") {
    const v3Quoter =
      Object.values(UNISWAP_V3).find((d) => d.router.toLowerCase() === route.router.toLowerCase())
        ?.quoter ?? UNISWAP_V3_QUOTER_V2_BASE;
    if (route.fees)
      return {
        address: v3Quoter,
        abi: UNISWAP_V3_QUOTER_V2_ABI as Abi,
        functionName: "quoteExactInput",
        args: [encodeV3Path(route.path, route.fees), amount],
      };
    return {
      address: v3Quoter,
      abi: UNISWAP_V3_QUOTER_V2_ABI as Abi,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn: route.path[0]!,
          tokenOut: route.path[1]!,
          amountIn: amount,
          fee: route.fee ?? 3000,
          sqrtPriceLimitX96: 0n,
        },
      ],
    };
  }
  return {
    address: route.router,
    abi: (route.venue === "Aerodrome" ? AERODROME_ROUTER_ABI : UNISWAP_V2_ROUTER_ABI) as Abi,
    functionName: "getAmountsOut",
    args: [amount, route.venue === "Aerodrome" ? aeroRoutes(route) : route.path],
  };
}
export function routeSwapCall(
  route: SmartRoute,
  sell: Token,
  buy: Token,
  amount: bigint,
  minimum: bigint,
  recipient: Address,
  deadline: bigint
) {
  if (route.venue === "Uniswap V3") {
    const v3 = getUniswapV3Deployment(sell.chainId);
    const fees = v3RouteFees(route);
    if (
      !v3 ||
      sell.chainId !== buy.chainId ||
      route.path.length < 2 ||
      route.path.length > 3 ||
      fees.length !== route.path.length - 1 ||
      (route.fees !== undefined && route.fee !== undefined) ||
      amount <= 0n ||
      minimum <= 0n ||
      !fees.every(isV3Fee)
    ) {
      throw new Error("Invalid V3 swap parameters");
    }
    const wrapped = getWrappedNativeAddress(sell.chainId);
    const from = sell.address === "native" ? wrapped : sell.address;
    const to = buy.address === "native" ? wrapped : buy.address;
    if (
      route.router.toLowerCase() !== v3.router.toLowerCase() ||
      route.path[0]?.toLowerCase() !== from.toLowerCase() ||
      route.path.at(-1)?.toLowerCase() !== to.toLowerCase()
    ) {
      throw new Error("V3 route does not match the selected tokens and router");
    }
    const swapRecipient =
      buy.address === "native" ? "0x0000000000000000000000000000000000000002" : recipient;
    const swapData = route.fees
      ? encodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
          functionName: "exactInput",
          args: [
            {
              path: encodeV3Path(route.path, route.fees),
              recipient: swapRecipient,
              amountIn: amount,
              amountOutMinimum: minimum,
            },
          ],
        })
      : encodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: route.path[0]!,
              tokenOut: route.path[1]!,
              fee: route.fee ?? 3000,
              recipient: swapRecipient,
              amountIn: amount,
              amountOutMinimum: minimum,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
    const calls = [swapData];
    if (buy.address === "native")
      calls.push(
        encodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
          functionName: "unwrapWETH9",
          args: [minimum, recipient],
        })
      );
    if (sell.address === "native")
      calls.push(
        encodeFunctionData({
          abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
          functionName: "refundETH",
        })
      );
    return {
      address: route.router,
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI as Abi,
      functionName: "multicall",
      args: [deadline, calls],
      ...(sell.address === "native" ? { value: amount } : {}),
    };
  }

  const path = route.venue === "Aerodrome" ? aeroRoutes(route) : route.path;
  return {
    address: route.router,
    abi: (route.venue === "Aerodrome" ? AERODROME_ROUTER_ABI : UNISWAP_V2_ROUTER_ABI) as Abi,
    functionName:
      sell.address === "native"
        ? "swapExactETHForTokens"
        : buy.address === "native"
          ? "swapExactTokensForETH"
          : "swapExactTokensForTokens",
    args:
      sell.address === "native"
        ? [minimum, path, recipient, deadline]
        : [amount, minimum, path, recipient, deadline],
    ...(sell.address === "native" ? { value: amount } : {}),
  };
}
export async function quoteSmartRoutes(
  client: Pick<PublicClient, "getBlockNumber" | "multicall">,
  sell: Token,
  buy: Token,
  amount: bigint
) {
  if (amount <= 0n) throw new Error("Enter a positive amount.");
  const routes = routeCandidates(sell, buy);
  const observedAt = Date.now();
  const blockNumber = await client.getBlockNumber();
  const results = await client.multicall({
    blockNumber,
    allowFailure: true,
    contracts: routes.map((route) => routeQuoteCall(route, amount)),
  });
  const quotes = results
    .flatMap((r, i) => {
      if (r.status !== "success") return [];
      const route = routes[i]!;
      let output: bigint | undefined;
      if (route.venue === "Uniswap V3") {
        const res = r.result as readonly [bigint, bigint, number, bigint] | readonly bigint[];
        output = Array.isArray(res) ? res[0] : undefined;
      } else {
        const amounts = r.result as readonly bigint[];
        output = amounts.at(-1);
      }
      return output && output > 0n ? [{ route, output }] : [];
    })
    .sort((a, b) => (a.output > b.output ? -1 : a.output < b.output ? 1 : 0));
  return { quotes, blockNumber, observedAt, best: quotes[0] ?? null };
}
