import { useCallback, useEffect, useState } from "react";

import { ARB_API_URL } from "@/config/crypto-arb";

export interface LiveAccount {
  configured: boolean;
  mode: "live";
  endpointVerified?: boolean;
  endpoint?: string;
  inventoryVerified: boolean;
  tradingEnabled?: boolean;
  updatedAt: number;
  totalUsdEst: number;
  cash: number;
  buyingPower: number;
  free: Record<string, number>;
  total: Record<string, number>;
  breakdown?: Array<{ asset: string; free: number; reserved: number; usdValue: number | null }>;
  makerFee?: number;
  takerFee?: number;
  cryptoTier?: number;
  feeSource?: string;
  underlyingVenue?: string;
  error?: string;
  unpricedAssets?: string[];
}

export function useLiveAccounts() {
  const [accounts, setAccounts] = useState<Partial<Record<"alpaca" | "kraken", LiveAccount>>>({});
  const [connected, setConnected] = useState(false);
  const [now, setNow] = useState(Date.now);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled(
      (["alpaca", "kraken"] as const).map(async (venue) => {
        const response = await fetch(`${ARB_API_URL}/api/${venue}/account`, {
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw new Error("Account refresh failed");
        return [venue, (await response.json()) as LiveAccount] as const;
      })
    );
    setAccounts((previous) => {
      const next = { ...previous };
      for (const result of results) {
        if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const source = new EventSource(`${ARB_API_URL}/api/accounts/stream`);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { accounts?: typeof accounts; mode?: string };
        if (data.mode === "live" && data.accounts) {
          setAccounts(data.accounts);
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    };
    source.onerror = () => setConnected(false);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      source.close();
      window.clearInterval(clock);
    };
  }, []);

  const account = (venue: "alpaca" | "kraken") => {
    const value = accounts[venue];
    if (!value) return null;
    const stale = !value.updatedAt || now - value.updatedAt > 30000;
    return {
      ...value,
      configured: value.configured && value.mode === "live" && !stale,
      error: stale ? "Balance update is stale; reconnecting" : value.error,
    };
  };

  return { alpacaAccount: account("alpaca"), krakenAccount: account("kraken"), connected, refresh };
}
