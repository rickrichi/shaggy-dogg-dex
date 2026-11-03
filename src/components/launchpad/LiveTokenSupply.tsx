// src/components/launchpad/LiveTokenSupply.tsx
import { type Address, erc20Abi, formatUnits } from "viem";
import { base } from "viem/chains";
import { useReadContract } from "wagmi";

interface LiveTokenSupplyProps {
  tokenAddress: Address;
  decimals: number;
  fallback: string;
}

/** Reads supply from the chain, because mintable tokens can outgrow any stored figure. */
export function LiveTokenSupply({ tokenAddress, decimals, fallback }: LiveTokenSupplyProps) {
  const { data } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "totalSupply",
    chainId: base.id,
  });
  if (data === undefined) return fallback;
  return Number(formatUnits(data, decimals)).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}
