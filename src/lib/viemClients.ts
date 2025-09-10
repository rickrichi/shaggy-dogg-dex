import { createPublicClient, createWalletClient, http, type Address, custom } from 'viem';
import { mainnet } from 'viem/chains';

// Minimal EIP-1193 provider typing
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

// Runtime guard
function isEthereumProvider(obj: unknown): obj is EthereumProvider {
  return typeof obj === 'object' && obj !== null && 'request' in obj;
}

const RPC_URL = import.meta.env.VITE_ALCHEMY_RPC_URL as string;
if (!RPC_URL) throw new Error('Missing VITE_ALCHEMY_RPC_URL');

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL),
});

export const walletClient = typeof window !== 'undefined' && isEthereumProvider((window as Window & typeof globalThis).ethereum)
  ? createWalletClient({
      chain: mainnet,
      transport: custom((window as Window & typeof globalThis).ethereum),
    })
  : null;

// Deployed contracts (your addresses)
export const SDT = { address: '0x308673cBfc6faDe727bFf74866b4Cc2ADFeF9493' as Address };
export const FDS = { address: '0xbfd5da945fe6428b3421429778c75cf8e07ef05f' as Address };
