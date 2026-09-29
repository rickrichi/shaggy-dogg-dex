import { type Address, createPublicClient, createWalletClient, custom, http } from "viem";
import { mainnet } from "viem/chains";

// Minimal EIP-1193 provider typing
interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

// Runtime guard
function isEthereumProvider(obj: unknown): obj is EthereumProvider {
  return typeof obj === "object" && obj !== null && "request" in obj;
}

const RPC_URL = import.meta.env.VITE_ALCHEMY_RPC_URL as string;
if (!RPC_URL) throw new Error("Missing VITE_ALCHEMY_RPC_URL");

export const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL),
});

const ethProvider =
  typeof window !== "undefined" &&
  isEthereumProvider((window as Window & typeof globalThis).ethereum)
    ? (window as Window & typeof globalThis).ethereum
    : null;

export const walletClient = ethProvider
  ? createWalletClient({
      chain: mainnet,
      transport: custom(ethProvider),
    })
  : null;

// Deployed contracts (Base Sepolia)
export const SDT = { address: "0x051c758521971f5c5a84edaf18eea12854375469" as Address };
export const FDS = { address: "0x42134ccc6c41149cf71c7b4994e33ee66758af20" as Address };
