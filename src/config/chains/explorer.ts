import { getChainConfig } from "./guards";
import { type SupportedChainId } from "./types";

export function buildExplorerTxUrl(chainId: SupportedChainId, txHash: string): string {
  const { explorerUrl } = getChainConfig(chainId);
  return `${explorerUrl}/tx/${txHash}`;
}

export function buildExplorerAddressUrl(chainId: SupportedChainId, address: string): string {
  const { explorerUrl } = getChainConfig(chainId);
  return `${explorerUrl}/address/${address}`;
}
