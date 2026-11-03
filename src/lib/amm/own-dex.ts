import { keccak256, parseAbi } from "viem";

import artifacts from "@/config/dex/artifacts.json";
import { DEX_CHAIN_ID, DEX_WETH } from "@/config/dex/deployment";

import type { Hex, PublicClient } from "viem";
import type { DexDeployment } from "@/config/dex/deployment";

export const DEX_FACTORY_ABI = parseAbi([
  "function getPair(address,address) view returns (address)",
  "function feeTo() view returns (address)",
  "function feeToSetter() view returns (address)",
  "function setFeeTo(address _feeTo)",
  "function allPairsLength() view returns (uint256)",
]);
export const DEX_ROUTER_METADATA_ABI = parseAbi([
  "function factory() view returns (address)",
  "function WETH() view returns (address)",
]);

export function normalizedRuntime(
  code: Hex,
  ranges: Array<{ start: number; length: number }>
): Hex {
  let body = code.slice(2).toLowerCase();
  for (const { start, length } of ranges)
    body = body.slice(0, start * 2) + "0".repeat(length * 2) + body.slice((start + length) * 2);
  return `0x${body}`;
}

export async function verifyDexDeployment(
  client: Pick<PublicClient, "getChainId" | "getCode" | "readContract">,
  deployment: DexDeployment
) {
  if ((await client.getChainId()) !== DEX_CHAIN_ID)
    throw new Error("The DEX requires Base mainnet (8453).");
  const [factoryCode, routerCode, factory, weth] = await Promise.all([
    client.getCode({ address: deployment.factory }),
    client.getCode({ address: deployment.router }),
    client.readContract({
      address: deployment.router,
      abi: DEX_ROUTER_METADATA_ABI,
      functionName: "factory",
    }),
    client.readContract({
      address: deployment.router,
      abi: DEX_ROUTER_METADATA_ABI,
      functionName: "WETH",
    }),
  ]);
  if (!factoryCode || keccak256(factoryCode) !== keccak256(artifacts.factory.runtime as Hex))
    throw new Error("Factory bytecode does not match the pinned V2 factory.");
  if (
    !routerCode ||
    routerCode.length !== artifacts.router.runtime.length ||
    keccak256(normalizedRuntime(routerCode, artifacts.router.immutableRanges)) !==
      keccak256(artifacts.router.runtime as Hex)
  )
    throw new Error("Router bytecode does not match pinned Router02.");
  if (
    factory.toLowerCase() !== deployment.factory.toLowerCase() ||
    weth.toLowerCase() !== DEX_WETH.toLowerCase()
  )
    throw new Error("Router factory/WETH configuration mismatch.");
  return deployment;
}

export function positiveAmount(value: string, decimals: number): boolean {
  return (
    /^\d+(\.\d*)?$/.test(value) &&
    (value.split(".")[1]?.length ?? 0) <= decimals &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}
