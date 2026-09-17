import { createPublicClient, http, zeroAddress } from "viem";
import { mainnet } from "viem/chains";

import { LUMIORO_MAINNET_RELEASE } from "../src/config/amm/lumioro-mainnet-release";

const FACTORY_ABI = [
  {
    type: "function",
    name: "getPair",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
    ],
    outputs: [{ name: "pair", type: "address" }],
  },
] as const;

const PAIR_ABI = [
  {
    type: "function",
    name: "getReserves",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "reserve0", type: "uint112" },
      { name: "reserve1", type: "uint112" },
      { name: "blockTimestampLast", type: "uint32" },
    ],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function readRpcUrl(argumentsList: readonly string[]): string {
  if (argumentsList.length !== 2 || argumentsList[0] !== "--rpc-url") {
    throw new Error("Usage: discover-lumioro-uniswap-v2-pair --rpc-url <https-url>");
  }
  const parsed = new URL(argumentsList[1]);
  if (parsed.protocol !== "https:") {
    throw new Error("The RPC URL must use HTTPS.");
  }
  return parsed.toString();
}

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);
}

async function main(): Promise<void> {
  const rpcUrl = readRpcUrl(process.argv.slice(2));
  const client = createPublicClient({ chain: mainnet, transport: http(rpcUrl) });
  const [chainId, block, pair] = await Promise.all([
    client.getChainId(),
    client.getBlock(),
    client.readContract({
      address: LUMIORO_MAINNET_RELEASE.factory,
      abi: FACTORY_ABI,
      functionName: "getPair",
      args: [LUMIORO_MAINNET_RELEASE.token.address, LUMIORO_MAINNET_RELEASE.wrappedNative],
    }),
  ]);

  if (chainId !== LUMIORO_MAINNET_RELEASE.chainId) {
    throw new Error("Expected Ethereum mainnet chain ID 1.");
  }

  const report: Record<string, unknown> = {
    kind: "LUMIORO_UNISWAP_V2_PAIR_DISCOVERY",
    execution: "DISABLED",
    operation: "READ_ONLY",
    rpcOrigin: new URL(rpcUrl).origin,
    chainId,
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    factory: LUMIORO_MAINNET_RELEASE.factory,
    token: LUMIORO_MAINNET_RELEASE.token.address,
    wrappedNative: LUMIORO_MAINNET_RELEASE.wrappedNative,
    pair,
    pairExists: pair.toLowerCase() !== zeroAddress,
  };

  if (pair.toLowerCase() !== zeroAddress) {
    const [reserves, lpTotalSupply] = await Promise.all([
      client.readContract({ address: pair, abi: PAIR_ABI, functionName: "getReserves" }),
      client.readContract({ address: pair, abi: PAIR_ABI, functionName: "totalSupply" }),
    ]);
    report.reserves = {
      reserve0: reserves[0],
      reserve1: reserves[1],
      blockTimestampLast: reserves[2],
    };
    report.lpTotalSupply = lpTotalSupply;
  } else {
    report.reserves = null;
    report.lpTotalSupply = null;
  }

  console.log(json(report));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
