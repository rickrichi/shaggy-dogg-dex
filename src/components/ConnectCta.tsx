// src/components/ConnectCta.tsx
import { useMemo } from "react";
import type { JSX } from "react/jsx-dev-runtime";
import { useAccount, useConnect, type Connector } from "wagmi";

function hasProvider(connector: Connector): boolean {
  const p = (connector as Connector & { getProvider?: () => unknown }).getProvider?.();
  return Boolean(p);
}

export default function ConnectCta(): JSX.Element {
  const { isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();

  const mm = useMemo(() => connectors.find(c => c.id === "metaMask"), [connectors]);
  const injected = useMemo(() => connectors.find(c => c.id === "injected"), [connectors]);
  const wc = useMemo(() => connectors.find(c => c.id === "walletConnect"), [connectors]);
  const cb = useMemo(() => connectors.find(c => c.id === "coinbaseWallet"), [connectors]);

  if (isConnected) return <></>;

  const mmReady = mm ? hasProvider(mm) : false;
  const injReady = injected ? hasProvider(injected) : false;

  return (
    <div className="flex flex-col gap-2">
      {mm && mmReady ? (
        <button onClick={() => connect({ connector: mm })} disabled={isPending} className="rounded-lg px-3 py-1 border">
          {isPending ? "Connecting…" : "Connect MetaMask"}
        </button>
      ) : injReady && injected ? (
        <button onClick={() => connect({ connector: injected })} disabled={isPending} className="rounded-lg px-3 py-1 border">
          {isPending ? "Connecting…" : "Connect Browser Wallet"}
        </button>
      ) : (
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1 border text-center">
          Install MetaMask
        </a>
      )}

      {wc && (
        <button onClick={() => connect({ connector: wc })} disabled={isPending} className="rounded-lg px-3 py-1 border">
          {isPending ? "Connecting…" : "Connect with WalletConnect"}
        </button>
      )}
      {cb && (
        <button onClick={() => connect({ connector: cb })} disabled={isPending} className="rounded-lg px-3 py-1 border">
          {isPending ? "Connecting…" : "Connect Coinbase Wallet"}
        </button>
      )}

      {error && <pre className="text-red-600 text-xs whitespace-pre-wrap">{String(error.message || error)}</pre>}
    </div>
  );
}
