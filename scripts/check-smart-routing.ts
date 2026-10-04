import { createPublicClient, formatUnits } from "viem";
import { base } from "viem/chains";

import { BASE_MAINNET_TOKENS } from "../src/config/tokens";
import { quoteSmartRoutes } from "../src/lib/amm/smart-routing";
import { createBaseReadTransport } from "../src/lib/base-rpc";

const client = createPublicClient({ chain: base, transport: createBaseReadTransport() });
const sell = BASE_MAINNET_TOKENS.find(t => t.symbol === "USDC")!;
const buy = BASE_MAINNET_TOKENS.find(t => t.symbol === "WETH")!;
const result = await quoteSmartRoutes(client, sell, buy, 25_000_000n);
if (!result.best) throw new Error("No live route for 25 USDC to WETH");
console.log(`Base block ${result.blockNumber}: 25 USDC -> WETH`);
for (const venue of ["Uniswap V2", "Aerodrome"]) {
  const quote = result.quotes.find(q => q.route.venue === venue);
  console.log(venue, quote ? formatUnits(quote.output, 18) : "No route");
}
console.log("Best quoted output before gas:", result.best.route.venue);
