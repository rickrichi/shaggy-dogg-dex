// src/lib/wallet.ts
import { type Address, createWalletClient, custom, type EIP1193Provider } from "viem";
import { mainnet } from "viem/chains";

/** Narrow runtime guard for window.ethereum */
function isEIP1193Provider(x: unknown): x is EIP1193Provider {
  return typeof x === "object" && x !== null && "request" in x;
}

/** Result shape returned by connectWallet */
export interface ConnectResult {
  address: Address;
  walletClient: ReturnType<typeof createWalletClient>;
  chainId: number;
}

/** Error variants for precise handling in UI */
export type ConnectError =
  | { type: "NO_PROVIDER"; message: string }
  | { type: "USER_REJECTED"; message: string }
  | { type: "SWITCH_CHAIN_FAILED"; message: string }
  | { type: "UNKNOWN"; message: string };

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Unknown error";
}

/**
 * Connects to the user's wallet, requests accounts, and ensures the target chain.
 * - Strict types, no `any`
 * - Runtime guard for provider
 * - Attempts a chain switch if needed
 */
export async function connectWallet(expectedChainId: number = mainnet.id): Promise<ConnectResult> {
  // 1) Get provider
  const eth: unknown = (globalThis as unknown as { window?: Window }).window
    ? (window as Window & typeof globalThis).ethereum
    : undefined;

  if (!isEIP1193Provider(eth)) {
    const err: ConnectError = {
      type: "NO_PROVIDER",
      message:
        "No EIP-1193 provider found. Open this in a browser wallet like MetaMask or Coinbase Wallet.",
    };
    throw new Error(err.message);
  }

  // 2) Create client (chain here is the one we want to use)
  const walletClient = createWalletClient({
    chain: mainnet,
    transport: custom(eth),
  });

  // 3) Request account access
  try {
    await eth.request({ method: "eth_requestAccounts" });
  } catch (e: unknown) {
    const message = toErrorMessage(e);
    const err: ConnectError = {
      type: "USER_REJECTED",
      message: message || "User rejected wallet connection. Please approve in your wallet.",
    };
    throw new Error(err.message);
  }

  // 4) Ensure correct chain
  const currentChainId = await walletClient.getChainId();
  if (currentChainId !== expectedChainId) {
    try {
      await walletClient.switchChain({ id: expectedChainId });
    } catch (_e: unknown) {
      const err: ConnectError = {
        type: "SWITCH_CHAIN_FAILED",
        message:
          "Unable to switch chain in wallet. Please switch to the expected network and try again.",
      };
      throw new Error(err.message);
    }
  }

  // 5) Derive address
  const addresses = await walletClient.getAddresses();
  if (addresses.length === 0) {
    const err: ConnectError = {
      type: "UNKNOWN",
      message: "No account returned from wallet.",
    };
    throw new Error(err.message);
  }

  return {
    address: addresses[0] as Address,
    walletClient,
    chainId: await walletClient.getChainId(),
  };
}

/** Optional: subscribe to account/chain changes (cleanly typed) */
export function onWalletEvents(opts: {
  onAccountsChanged?: (addrs: Address[]) => void;
  onChainChanged?: (chainIdHex: string) => void;
  onDisconnect?: (info?: unknown) => void;
}): () => void {
  const eth: unknown = (globalThis as unknown as { window?: Window }).window
    ? (window as Window & typeof globalThis).ethereum
    : undefined;

  if (!isEIP1193Provider(eth)) return () => {};

  const handlers: Array<{
    event: "accountsChanged" | "chainChanged" | "disconnect";
    fn: (...args: unknown[]) => void;
  }> = [];

  if (opts.onAccountsChanged) {
    const fn = (accs: unknown) => {
      if (Array.isArray(accs)) {
        const typed = accs.filter((a): a is Address => typeof a === "string");
        opts.onAccountsChanged?.(typed);
      }
    };
    eth.on?.("accountsChanged", fn);
    handlers.push({ event: "accountsChanged", fn });
  }

  if (opts.onChainChanged) {
    const fn = (chainId: unknown) => {
      if (typeof chainId === "string") opts.onChainChanged?.(chainId);
    };
    eth.on?.("chainChanged", fn);
    handlers.push({ event: "chainChanged", fn });
  }

  if (opts.onDisconnect) {
    const fn = (info: unknown) => opts.onDisconnect?.(info);
    eth.on?.("disconnect", fn);
    handlers.push({ event: "disconnect", fn });
  }

  // Unsubscribe
  return () => {
    handlers.forEach(({ event, fn }) => eth.removeListener?.(event, fn));
  };
}
