import { type Abi, type Address, encodeFunctionData, type PublicClient } from "viem";

import {
  AERODROME_ROUTER_ABI,
  UNISWAP_V2_ROUTER_ABI,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V3_SWAP_ROUTER_02_ABI,
} from "@/config/abis";
import {
  getUniswapV2Router,
  UNISWAP_V3_QUOTER_V2_BASE,
  UNISWAP_V3_ROUTER_BASE,
} from "@/config/contracts";
import { getWrappedNativeAddress, type Token } from "@/config/tokens";

import { V3_FEE_TIERS } from "./uniswap-v3";

export const AERODROME_ROUTER: Address = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
export const AERODROME_FACTORY: Address = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
export interface SmartRoute {
  venue: "Uniswap V3" | "Uniswap V2" | "Aerodrome";
  router: Address;
  path: Address[];
  stable: boolean[];
  fee?: number;
}
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
  const from = sell.address === "native" ? wrapped : sell.address;
  const to = buy.address === "native" ? wrapped : buy.address;
  if (from.toLowerCase() === to.toLowerCase()) return [];
  const paths: Address[][] = [[from, to]];
  if (from.toLowerCase() !== wrapped.toLowerCase() && to.toLowerCase() !== wrapped.toLowerCase())
    paths.push([from, wrapped, to]);
  return paths.flatMap((path) => {
    const uniV2: SmartRoute = {
      venue: "Uniswap V2",
      router: getUniswapV2Router(sell.chainId),
      path,
      stable: [],
    };
    if (sell.chainId !== 8453) return [uniV2];
    const uniV3: SmartRoute[] =
      path.length === 2
        ? V3_FEE_TIERS.map(({ fee }) => ({
            venue: "Uniswap V3" as const,
            router: UNISWAP_V3_ROUTER_BASE,
            path,
            stable: [],
            fee,
          }))
        : [];
    const aero: SmartRoute[] = Array.from(
      { length: 2 ** (path.length - 1) },
      (_, mask): SmartRoute => ({
        venue: "Aerodrome",
        router: AERODROME_ROUTER,
        path,
        stable: path.slice(1).map((_, i) => Boolean(mask & (1 << i))),
      })
    );
    return [...uniV3, uniV2, ...aero];
  });
}
export function routeQuoteCall(route: SmartRoute, amount: bigint) {
  if (route.venue === "Uniswap V3") {
    return {
      address: UNISWAP_V3_QUOTER_V2_BASE,
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
    if (
      sell.chainId !== 8453 ||
      buy.chainId !== 8453 ||
      route.path.length !== 2 ||
      amount <= 0n ||
      minimum <= 0n ||
      !V3_FEE_TIERS.some((tier) => tier.fee === route.fee)
    ) {
      throw new Error("Invalid Base V3 swap parameters");
    }
    const from = sell.address === "native" ? getWrappedNativeAddress(8453) : sell.address;
    const to = buy.address === "native" ? getWrappedNativeAddress(8453) : buy.address;
    if (
      route.router.toLowerCase() !== UNISWAP_V3_ROUTER_BASE.toLowerCase() ||
      route.path[0]?.toLowerCase() !== from.toLowerCase() ||
      route.path[1]?.toLowerCase() !== to.toLowerCase()
    ) {
      throw new Error("V3 route does not match the selected tokens and router");
    }
    const swapData = encodeFunctionData({
      abi: UNISWAP_V3_SWAP_ROUTER_02_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: route.path[0]!,
          tokenOut: route.path[1]!,
          fee: route.fee ?? 3000,
          recipient:
            buy.address === "native" ? "0x0000000000000000000000000000000000000002" : recipient,
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
