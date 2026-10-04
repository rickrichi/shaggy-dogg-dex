import { createPublicClient, formatUnits,http, parseUnits } from "viem";
import { base } from "viem/chains";

import { AERODROME_ROUTER_ABI, UNISWAP_V2_ROUTER_ABI } from "../src/config/abis.js";

const client = createPublicClient({
  chain: base,
  transport: http("https://base-rpc.publicnode.com"),
});

const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const AERO_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631";
const CBBTC = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";
const VIRTUAL = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";

async function main() {
  console.log("Checking Base Routers...");
  const routers = [
    { name: "Uniswap V2", address: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" },
    { name: "SushiSwap V2", address: "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891" },
    { name: "BaseSwap", address: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86" },
    { name: "PancakeSwap V2", address: "0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb" },
  ];
  for (const r of routers) {
    const code = await client.getBytecode({ address: r.address as `0x${string}` });
    console.log(r.name, r.address, code && code.length > 2 ? `DEPLOYED (${code.length} bytes)` : "NOT DEPLOYED");
  }

  const amountIn = parseUnits("2500", 6); // 2500 USDC
  let uniOut: readonly bigint[] | null = null;
  for (const r of routers) {
    try {
      const out = await client.readContract({
        address: r.address as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, [USDC, WETH]],
      });
      if (r.name === "Uniswap V2") {
        uniOut = out;
      }
      const wethOut = out[out.length - 1];
      const price = 2500 / Number(formatUnits(wethOut, 18));
      console.log(`${r.name.padEnd(15)}: 2,500 USDC -> ${formatUnits(wethOut, 18).slice(0, 8)} WETH (Price: $${price.toFixed(2)})`);
    } catch (e) {
      console.log(`${r.name.padEnd(15)}: No direct USDC/WETH pool or error`);
    }
  }
  try {
    const aeroOut = await client.readContract({
      address: AERODROME_ROUTER,
      abi: AERODROME_ROUTER_ABI,
      functionName: "getAmountsOut",
      args: [amountIn, [{ from: USDC, to: WETH, stable: false, factory: AERO_FACTORY }]],
    });
    const wethOutAero = aeroOut[aeroOut.length - 1];
    const aeroPrice = 2500 / Number(formatUnits(wethOutAero, 18));
    console.log(`Aerodrome  2,500 USDC -> WETH: ${formatUnits(wethOutAero, 18)} WETH (Price: $${aeroPrice.toFixed(2)})`);

  // Test encoding executeGenericArbitrage
  import("viem").then(({ encodeFunctionData }) => {
    const aeroSwapCalldata = encodeFunctionData({
      abi: AERODROME_ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [
        amountIn,
        0n,
        [{ from: USDC, to: WETH, stable: false, factory: AERO_FACTORY }],
        "0x70315019d12a11556c837970675cdc8fa54d186b",
        BigInt(Math.floor(Date.now() / 1000) + 1200),
      ],
    });
    console.log("Encoded Aerodrome calldata length:", aeroSwapCalldata.length);
  });
    if (uniOut && uniOut.length > 0) {
      const wethOutUni = uniOut[uniOut.length - 1];
      const uniPrice = 2500 / Number(formatUnits(wethOutUni, 18));
      console.log(`Uniswap V2 2,500 USDC -> WETH: ${formatUnits(wethOutUni, 18)} WETH (Price: $${uniPrice.toFixed(2)})`);

      const spreadBps = ((uniPrice - aeroPrice) / aeroPrice) * 10000;
      console.log(`Aerodrome vs Uniswap V2 WETH Spread: ${spreadBps.toFixed(2)} bps`);
    }

    // 3. Test AERO token
    try {
      const aeroAero = await client.readContract({
        address: AERODROME_ROUTER,
        abi: AERODROME_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, [{ from: USDC, to: AERO, stable: false, factory: AERO_FACTORY }]],
      });
      const aeroUni = await client.readContract({
        address: UNISWAP_V2_ROUTER,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, [USDC, AERO]],
      });
      const aeroPriceAero = 2500 / Number(formatUnits(aeroAero[aeroAero.length - 1], 18));
      const aeroPriceUni = 2500 / Number(formatUnits(aeroUni[aeroUni.length - 1], 18));
      console.log(`AERO Price: Aerodrome=$${aeroPriceAero.toFixed(4)}, UniV2=$${aeroPriceUni.toFixed(4)} | Spread: ${(((aeroPriceUni - aeroPriceAero) / aeroPriceAero) * 10000).toFixed(2)} bps`);
    } catch (errAero) {
      console.log("AERO test error:", (errAero as Error).message);
    }

    // 4. Test cbBTC
    try {
      const btcAero = await client.readContract({
        address: AERODROME_ROUTER,
        abi: AERODROME_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, [{ from: USDC, to: CBBTC, stable: false, factory: AERO_FACTORY }]],
      });
      const btcUni = await client.readContract({
        address: UNISWAP_V2_ROUTER,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountIn, [USDC, CBBTC]],
      });
      const btcPriceAero = 2500 / Number(formatUnits(btcAero[btcAero.length - 1], 8));
      const btcPriceUni = 2500 / Number(formatUnits(btcUni[btcUni.length - 1], 8));
      console.log(`cbBTC Price: Aerodrome=$${btcPriceAero.toFixed(2)}, UniV2=$${btcPriceUni.toFixed(2)} | Spread: ${(((btcPriceUni - btcPriceAero) / btcPriceAero) * 10000).toFixed(2)} bps`);

      // Cross-DEX cbBTC: Buy on Uniswap V2, Sell on Aerodrome
      const cbBtcFromUni = btcUni[btcUni.length - 1];
      const aeroSale = await client.readContract({
        address: AERODROME_ROUTER,
        abi: AERODROME_ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [cbBtcFromUni, [{ from: CBBTC, to: USDC, stable: false, factory: AERO_FACTORY }]],
      });
      const usdcReturned = Number(formatUnits(aeroSale[aeroSale.length - 1], 6));
      console.log(`Cross-DEX cbBTC ($2,500 USDC): Buy on UniV2 -> Sell on Aerodrome => $${usdcReturned.toFixed(2)} USDC (Net PnL: $${(usdcReturned - 2500).toFixed(2)})`);

      // Test VIRTUAL, BRETT, DEGEN on Aerodrome
      const BRETT = "0x532f27101965dd16442E59d40670FaF5eBB142E4";
      const DEGEN = "0x4eD4E862860be57a41B3eE299214175794294190";

      // 5. Test BRETT route: USDC -> WETH -> BRETT -> WETH -> USDC on Aerodrome
      try {
        const brettLoop = await client.readContract({
          address: AERODROME_ROUTER,
          abi: AERODROME_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [
            parseUnits("1000", 6),
            [
              { from: USDC, to: WETH, stable: false, factory: AERO_FACTORY },
              { from: WETH, to: BRETT, stable: false, factory: AERO_FACTORY },
              { from: BRETT, to: WETH, stable: false, factory: AERO_FACTORY },
              { from: WETH, to: USDC, stable: false, factory: AERO_FACTORY },
            ],
          ],
        });
        console.log(`BRETT 4-step loop 1000 USDC -> out: $${formatUnits(brettLoop[brettLoop.length - 1], 6)} USDC`);
      } catch (errB) {
        console.log("BRETT loop error:", (errB as Error).message);
      }

      // 6. Test DEGEN route: USDC -> WETH -> DEGEN -> WETH -> USDC on Aerodrome
      try {
        const degenLoop = await client.readContract({
          address: AERODROME_ROUTER,
          abi: AERODROME_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [
            parseUnits("1000", 6),
            [
              { from: USDC, to: WETH, stable: false, factory: AERO_FACTORY },
              { from: WETH, to: DEGEN, stable: false, factory: AERO_FACTORY },
              { from: DEGEN, to: WETH, stable: false, factory: AERO_FACTORY },
              { from: WETH, to: USDC, stable: false, factory: AERO_FACTORY },
            ],
          ],
        });
        console.log(`DEGEN 4-step loop 1000 USDC -> out: $${formatUnits(degenLoop[degenLoop.length - 1], 6)} USDC`);
      } catch (errD) {
        console.log("DEGEN loop error:", (errD as Error).message);
      }

      // 7. Test VIRTUAL route: USDC -> WETH -> VIRTUAL -> WETH -> USDC on Aerodrome
      try {
        const virtualLoop = await client.readContract({
          address: AERODROME_ROUTER,
          abi: AERODROME_ROUTER_ABI,
          functionName: "getAmountsOut",
          args: [
            parseUnits("1000", 6),
            [
              { from: USDC, to: WETH, stable: false, factory: AERO_FACTORY },
              { from: WETH, to: VIRTUAL, stable: false, factory: AERO_FACTORY },
              { from: VIRTUAL, to: WETH, stable: false, factory: AERO_FACTORY },
              { from: WETH, to: USDC, stable: false, factory: AERO_FACTORY },
            ],
          ],
        });
        console.log(`VIRTUAL 4-step loop 1000 USDC -> out: $${formatUnits(virtualLoop[virtualLoop.length - 1], 6)} USDC`);
      } catch (errV) {
        console.log("VIRTUAL loop error:", (errV as Error).message);
      }
    } catch (errBtc) {
      console.log("cbBTC test error:", (errBtc as Error).message);
    }
  } catch (e) {
    console.log("Error querying DEXes:", e);
  }
}

main().catch(console.error);
