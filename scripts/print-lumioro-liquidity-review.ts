import { buildLumioroLiquidityReview } from "../src/lib/amm/lumioro-liquidity-review";

const arguments_ = process.argv.slice(2);
if (arguments_.length !== 2 || arguments_[0] !== "--weth-wei") {
  throw new Error("Usage: --weth-wei <unsigned-integer-wei>");
}

const wethWei = arguments_[1];
if (!/^[1-9][0-9]*$/.test(wethWei)) {
  throw new Error("--weth-wei must be an unsigned integer number of wei.");
}

const review = buildLumioroLiquidityReview({
  wethAmountDesired: BigInt(wethWei),
  slippageBps: 0n,
});

console.log(
  JSON.stringify(
    review,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2
  )
);
