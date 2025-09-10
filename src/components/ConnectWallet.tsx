// src/components/ConnectWallet.tsx
import { useEffect, useMemo } from "react";
import type { JSX } from "react/jsx-dev-runtime";
import {
  useAccount,
  useConnect,
  useDisconnect,
  type Connector,
} from "wagmi";

function isInjectedAvailable(connector: Connector): boolean {
  // Most injected connectors expose getProvider(); treat undefined as “not installed”
  // Also handle legacy ‘injected’ id.
  const maybe = (connector as Connector & { getProvider?: () => unknown }).getProvider?.();
  return Boolean(maybe);
}

export default function ConnectWallet(): JSX.Element {
  const { connectors, connect, isPending, error: connectError } = useConnect();
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();

  const injected = useMemo(
    () => connectors.find((c) => c.id === "injected" || c.name.toLowerCase().includes("browser")),
    [connectors]
  );
  const metamask = useMemo(
    () => connectors.find((c) => c.id === "metaMask"),
    [connectors]
  );
  const walletconnect = useMemo(
    () => connectors.find((c) => c.id === "walletConnect"),
    [connectors]
  );
  const coinbase = useMemo(
    () => connectors.find((c) => c.id === "coinbaseWallet"),
    [connectors]
  );

  // Optional: attempt silent reconnect on mount (no UI prompt)
  useEffect(() => {
    // wagmi autoConnect can also be used in config; this is just illustrative.
  }, []);

  if (isConnected) {
    return (
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm">Connected: {address}</span>
        <button
          onClick={() => disconnect()}
          className="rounded-lg px-3 py-1 border"
        >
          Disconnect
        </button>
      </div>
    );
  }

  const injectedReady = injected ? isInjectedAvailable(injected) : false;
  const mmReady = metamask ? isInjectedAvailable(metamask) : false;

  return (
    <div className="flex flex-col gap-2">
      {/* Injected/MetaMask path */}
      {metamask && mmReady ? (
        <button
          disabled={isPending}
          onClick={() => connect({ connector: metamask })}
          className="rounded-lg px-3 py-1 border"
        >
          {isPending ? "Connecting…" : "Connect MetaMask"}
        </button>
      ) : injected && injectedReady ? (
        <button
          disabled={isPending}
          onClick={() => connect({ connector: injected })}
          className="rounded-lg px-3 py-1 border"
        >
          {isPending ? "Connecting…" : "Connect Browser Wallet"}
        </button>
      ) : (
        // No injected provider available — show install CTA instead of calling connect()
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg px-3 py-1 border text-center"
        >
          Install MetaMask
        </a>
      )}

      {/* Alternative connectors */}
      {walletconnect && (
        <button
          disabled={isPending}
          onClick={() => connect({ connector: walletconnect })}
          className="rounded-lg px-3 py-1 border"
        >
          {isPending ? "Connecting…" : "Connect with WalletConnect"}
        </button>
      )}
      {coinbase && (
        <button
          disabled={isPending}
          onClick={() => connect({ connector: coinbase })}
          className="rounded-lg px-3 py-1 border"
        >
          {isPending ? "Connecting…" : "Connect Coinbase Wallet"}
        </button>
      )}

      {connectError && (
        <pre className="text-red-600 text-xs whitespace-pre-wrap">
{String(connectError.message || connectError)}
        </pre>
      )}
    </div>
  );
}
