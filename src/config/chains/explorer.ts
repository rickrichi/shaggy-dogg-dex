import { type SupportedChainId } from './types';
import { getChainConfig } from './guards';

export function buildExplorerTxUrl(chainId: SupportedChainId, txHash: string): string {
  const { explorerUrl } = getChainConfig(chainId);
  return `${explorerUrl}/tx/${txHash}`;
}

export function buildExplorerAddressUrl(chainId: SupportedChainId, address: string): string {
  const { explorerUrl } = getChainConfig(chainId);
  return `${explorerUrl}/address/${address}`;
}
