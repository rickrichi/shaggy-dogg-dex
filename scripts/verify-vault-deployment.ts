import { createPublicClient, http, parseAbi } from "viem";
import { base } from "viem/chains";

const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const vault = "0x5c98f6bc9d17ba0eb02e1336bdf035938f5859e5" as const;

async function main() {
  const code = await client.getCode({ address: vault });
  console.log("Deployed Code exists:", !!code && code !== "0x", "length:", code ? code.length : 0);

  const abi = parseAbi([
    "function admin() view returns (address)",
    "function treasury() view returns (address)",
    "function discountDenominator() view returns (uint256)",
    "function underlyingAsset() view returns (address)",
    "function aavePool() view returns (address)",
    "function aToken() view returns (address)",
    "function totalShares() view returns (uint256)",
    "function totalAssets() view returns (uint256)",
  ]);

  const results = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: vault, abi, functionName: "admin" },
      { address: vault, abi, functionName: "treasury" },
      { address: vault, abi, functionName: "discountDenominator" },
      { address: vault, abi, functionName: "underlyingAsset" },
      { address: vault, abi, functionName: "aavePool" },
      { address: vault, abi, functionName: "aToken" },
      { address: vault, abi, functionName: "totalShares" },
      { address: vault, abi, functionName: "totalAssets" },
    ],
  });

  console.log("Multicall results:");
  const names = ["admin", "treasury", "discountDenominator", "underlyingAsset", "aavePool", "aToken", "totalShares", "totalAssets"];
  results.forEach((r, i) => console.log(`  ${names[i]}: status=${r.status} value=${r.result}`));
}

main().catch(console.error);
