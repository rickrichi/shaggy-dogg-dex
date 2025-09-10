// src/hooks/useWallets.ts
import { useEffect, useMemo, useState } from "react";
import { MetaMaskSDK } from "@metamask/sdk";
import { createPublicClient, http, formatEther, type Address } from "viem";
import { mainnet, base, arbitrum, optimism, polygon, sepolia } from "viem/chains";
import { CHAIN_CONFIG } from "@/lib/config";

/** Map chain keys -> viem chains (kept in sync with CHAIN_CONFIG keys) */
const CHAINS = { mainnet, base, arbitrum, optimism, polygon, sepolia } as const;
type ChainKey = keyof typeof CHAINS;

/* -----------------------------
   Minimal typed EIP-1193 surface
   ----------------------------- */

type AccountsChangedHandler = (accounts: string[]) => void;
type ChainChangedHandler = (chainId: string | number) => void;

interface Eip1193Requester {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
}
interface Eip1193Events {
  on(event: "accountsChanged", handler: AccountsChangedHandler): void;
  on(event: "chainChanged", handler: ChainChangedHandler): void;
  removeListener?(event: "accountsChanged", handler: AccountsChangedHandler): void;
  removeListener?(event: "chainChanged", handler: ChainChangedHandler): void;
}
type TypedProvider = Eip1193Requester & Eip1193Events;

/* -----------------------------
   Type guards / helpers
   ----------------------------- */

function isStringArray(u: unknown): u is string[] {
  return Array.isArray(u) && u.every((x) => typeof x === "string");
}
function toDecimalChainId(id: string | number): number {
  if (typeof id === "number") return id;
  // hex like "0x1" → 1
  return id.startsWith("0x") ? parseInt(id, 16) : Number(id);
}
function isHexAddress(s: string | null): s is Address {
  return !!s && /^0x[0-9a-fA-F]{40}$/.test(s);
}

/* -----------------------------
   Hook
   ----------------------------- */

export const useWallet = () => {
  const [sdk, setSdk] = useState<MetaMaskSDK | null>(null);
  const [provider, setProvider] = useState<TypedProvider | null>(null);

  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [balance, setBalance] = useState<string>("0");
  const [isConnecting, setIsConnecting] = useState(false);

  // Stable handlers so we can remove listeners on cleanup
  const onAccountsChanged: AccountsChangedHandler = (accounts) => {
    if (isStringArray(accounts) && isHexAddress(accounts[0] ?? null)) {
      setAccount(accounts[0] as Address);
    } else {
      setAccount(null);
    }
  };
  const onChainChanged: ChainChangedHandler = (cid) => {
    setChainId(toDecimalChainId(cid));
  };

  useEffect(() => {
    const initSDK = new MetaMaskSDK({
      dappMetadata: { name: "Shaggy Mutt DEX", url: window.location.href },
    });
    setSdk(initSDK);

    const p = initSDK.getProvider?.() as unknown as TypedProvider | undefined;
    if (p) {
      setProvider(p);
      // Typed listeners (no TS2345)
      p.on("accountsChanged", onAccountsChanged);
      p.on("chainChanged", onChainChanged);
    }

    return () => {
      try {
        // Best-effort detach to avoid leaks
        p?.removeListener?.("accountsChanged", onAccountsChanged);
        p?.removeListener?.("chainChanged", onChainChanged);
      } finally {
        initSDK.terminate();
      }
    };
     
  }, []);

  const connect = async () => {
    if (!sdk) return;
    setIsConnecting(true);
    try {
      const accounts = (await sdk.connect()) as unknown;
      if (isStringArray(accounts) && isHexAddress(accounts[0] ?? null)) {
        setAccount(accounts[0] as Address);
      }

      if (provider) {
        const id = (await provider.request({ method: "eth_chainId" })) as string | number;
        setChainId(toDecimalChainId(id));
      }
    } catch (error) {
      console.error("Connection failed:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    provider?.removeListener?.("accountsChanged", onAccountsChanged);
    provider?.removeListener?.("chainChanged", onChainChanged);
    sdk?.terminate();
    setAccount(null);
    setChainId(null);
    setBalance("0");
  };

  const getBalance = async () => {
    if (!account || !chainId) return;

    // Find the chain key in CHAIN_CONFIG by id
    const entry = Object.entries(CHAIN_CONFIG).find(
      ([, cfg]) => typeof cfg?.id === "number" && cfg.id === chainId
    ) as [ChainKey, { id: number; rpc?: string }] | undefined;

    if (!entry) return;
    const [key, cfg] = entry;
    const rpcUrl = cfg.rpc;
    if (!rpcUrl) return;

    try {
      const client = createPublicClient({
        chain: CHAINS[key],
        transport: http(rpcUrl),
      });
      const wei = await client.getBalance({ address: account });
      setBalance(formatEther(wei));
    } catch (error) {
      console.error("Failed to get balance:", error);
    }
  };

  useEffect(() => {
    if (account && chainId) void getBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, chainId]);

  const chainName = useMemo(
    () => (chainId ? Object.values(CHAIN_CONFIG).find((c) => c.id === chainId)?.name ?? null : null),
    [chainId]
  );

  return {
    account,
    chainId,
    chainName,
    balance,
    isConnecting,
    isConnected: Boolean(account),
    connect,
    disconnect,
  };
};
