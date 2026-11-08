import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  QrCode,
  RefreshCw,
  Smartphone,
  Wallet,
} from "lucide-react";
import { encodeQR } from "qr";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CANONICAL_DAPP_HOST = "dex.lumsian.com";

export type QrScanMode = "wc" | "camera" | "dapp";

interface WalletConnectProviderLike {
  on?: (event: string, listener: (uri: string) => void) => void;
  removeListener?: (event: string, listener: (uri: string) => void) => void;
  off?: (event: string, listener: (uri: string) => void) => void;
  signer?: {
    uri?: string;
  };
}

interface ConnectorEmitterLike {
  on?: (event: string, listener: (payload: { type?: string; data?: unknown }) => void) => void;
  off?: (event: string, listener: (payload: { type?: string; data?: unknown }) => void) => void;
}

/** The user closed the wallet window or declined in the wallet app. */
export const isUserCancel = (err: unknown) => {
  const e = err as { name?: string; code?: number; message?: string } | null;
  return (
    e?.name === "UserRejectedRequestError" ||
    e?.code === 4001 ||
    /user rejected|connection request reset/i.test(e?.message ?? "")
  );
};

/**
 * Build the host + path for MetaMask universal dApp links (`https://metamask.app.link/dapp/...`).
 * When running on localhost, falls back to `dex.lumsian.com` so scanning from an Android phone
 * over cellular/Wi-Fi opens the live DEX route.
 */
export const getDappHostAndPath = (): string => {
  if (typeof window === "undefined") {
    return `${CANONICAL_DAPP_HOST}/swap`;
  }
  const { hostname, host, pathname, search } = window.location;
  const isLocal =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
  const effectiveHost = isLocal ? CANONICAL_DAPP_HOST : host;
  const effectivePath = pathname && pathname !== "/" ? pathname : "/swap";
  return `${effectiveHost}${effectivePath}${search}`;
};

export const buildMetaMaskWcUniversalLink = (wcUri: string): string =>
  `https://metamask.app.link/wc?uri=${encodeURIComponent(wcUri)}`;

export const buildMetaMaskWcDeepLink = (wcUri: string): string =>
  `metamask://wc?uri=${encodeURIComponent(wcUri)}`;

export const buildMetaMaskDappLink = (): string =>
  `https://metamask.app.link/dapp/${getDappHostAndPath()}`;

export const buildQrSvgDataUrl = (value: string): string => {
  const svg = encodeQR(value, "svg", { border: 2 });
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const WalletConnect = () => {
  const { address, isConnected, chain, connector: activeConnector } = useAccount();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { data: balance } = useBalance({ address });

  const [isOpen, setIsOpen] = useState(false);
  const [showQrView, setShowQrView] = useState(false);
  const [qrMode, setQrMode] = useState<QrScanMode>("wc");
  const [wcUri, setWcUri] = useState<string | null>(null);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [copiedUri, setCopiedUri] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showExtensionHelp, setShowExtensionHelp] = useState(false);
  const [isMetaMaskInjected, setIsMetaMaskInjected] = useState(false);
  const [isCheckingExtension, setIsCheckingExtension] = useState(false);

  const isElectron =
    typeof window !== "undefined" &&
    (navigator.userAgent.toLowerCase().includes("electron") ||
      Boolean((window as unknown as { process?: { type?: string } }).process?.type));

  const isMobileDevice =
    typeof window !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const walletConnectConnector = connectors.find(
    (c) => c.id === "walletConnect" || c.name.toLowerCase().includes("walletconnect")
  );

  // Prefer MetaMask's EIP-6963 announcement; use the targeted legacy connector otherwise.
  // Never send the MetaMask action to an arbitrary window.ethereum provider or the SDK.
  const metaMaskConnector =
    connectors.find((c) => c.type === "injected" && c.id === "io.metamask") ||
    connectors.find((c) => c.type === "injected" && c.id === "metaMask");

  const coinbaseConnector = connectors.find(
    (c) => c.id === "coinbaseWalletSDK" || c.name.toLowerCase().includes("coinbase")
  );

  useEffect(() => {
    let cancelled = false;
    setIsMetaMaskInjected(false);
    void metaMaskConnector?.getProvider().then(
      (provider) => {
        if (!cancelled) setIsMetaMaskInjected(Boolean(provider));
      },
      () => {
        if (!cancelled) setIsMetaMaskInjected(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [metaMaskConnector, isOpen]);

  const walletConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  const clearWalletConnectWatch = useCallback(() => {
    if (walletConnectTimeoutRef.current) {
      clearTimeout(walletConnectTimeoutRef.current);
      walletConnectTimeoutRef.current = null;
    }
    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
      cleanupListenersRef.current = null;
    }
  }, []);

  useEffect(() => clearWalletConnectWatch, [clearWalletConnectWatch]);

  useEffect(() => {
    if (isConnected) {
      clearWalletConnectWatch();
      setIsOpen(false);
      setShowQrView(false);
      setWcUri(null);
      setIsGeneratingQr(false);
      setConnectError(null);
      setShowExtensionHelp(false);
    }
  }, [isConnected, clearWalletConnectWatch]);

  // Connect via MetaMask Mobile QR Code (WalletConnect) with inline QR rendering
  const handleConnectWalletConnect = useCallback(
    async (forceNewUri = false) => {
      setConnectError(null);
      setShowExtensionHelp(false);
      setIsOpen(true);
      setShowQrView(true);

      const target = walletConnectConnector || connectors.find((c) => c.type === "walletConnect");
      if (!target) {
        setIsGeneratingQr(false);
        setConnectError(
          "WalletConnect connector is not configured. Check VITE_WALLETCONNECT_PROJECT_ID."
        );
        return;
      }

      // If we already have an active pairing URI and the user didn't request a refresh, keep showing it
      if (wcUri && !forceNewUri) {
        return;
      }

      clearWalletConnectWatch();
      if (forceNewUri) {
        setWcUri(null);
      }
      setIsGeneratingQr(true);

      let receivedUri = false;
      const handleUri = (uri: string) => {
        if (!uri || typeof uri !== "string") return;
        receivedUri = true;
        if (walletConnectTimeoutRef.current) {
          clearTimeout(walletConnectTimeoutRef.current);
          walletConnectTimeoutRef.current = null;
        }
        setWcUri(uri);
        setIsGeneratingQr(false);
        setConnectError(null);
      };

      const emitter = (target as unknown as { emitter?: ConnectorEmitterLike }).emitter;
      const onConnectorMessage = (payload: { type?: string; data?: unknown }) => {
        if (payload?.type === "display_uri" && typeof payload.data === "string") {
          handleUri(payload.data);
        }
      };
      emitter?.on?.("message", onConnectorMessage);

      let providerInstance: WalletConnectProviderLike | undefined;
      try {
        providerInstance = (await target.getProvider()) as WalletConnectProviderLike | undefined;
        providerInstance?.on?.("display_uri", handleUri);
        if (!forceNewUri && providerInstance?.signer?.uri) {
          handleUri(providerInstance.signer.uri);
        }
      } catch {
        // Provider initialization errors will surface via connect() onError below.
      }

      cleanupListenersRef.current = () => {
        emitter?.off?.("message", onConnectorMessage);
        providerInstance?.removeListener?.("display_uri", handleUri);
        providerInstance?.off?.("display_uri", handleUri);
      };

      walletConnectTimeoutRef.current = setTimeout(() => {
        if (!receivedUri) {
          setIsGeneratingQr(false);
          setConnectError(
            "WalletConnect relay took too long to generate a pairing code. Click 'New QR Code' to retry, or switch to 'Open Swap on Phone' to open dex.lumsian.com/swap directly in MetaMask Mobile."
          );
        }
      }, 15000);

      connect(
        { connector: target },
        {
          onSuccess: () => {
            clearWalletConnectWatch();
            setIsGeneratingQr(false);
            setIsOpen(false);
            setShowQrView(false);
          },
          onError: (err) => {
            clearWalletConnectWatch();
            setIsGeneratingQr(false);
            if (isUserCancel(err)) return;
            setConnectError(err.message || "Failed to start WalletConnect pairing.");
            setIsOpen(true);
          },
        }
      );
    },
    [walletConnectConnector, connectors, wcUri, clearWalletConnectWatch, connect]
  );

  // Allow any page (such as /swap) to open the Connect Wallet dialog or jump straight to the QR view
  useEffect(() => {
    const onOpenWalletEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: "qr" | "list" }>).detail;
      setConnectError(null);
      setShowExtensionHelp(false);
      setIsOpen(true);
      if (detail?.view === "qr") {
        void handleConnectWalletConnect();
      } else {
        setShowQrView(false);
      }
    };
    window.addEventListener("shaggy:open-wallet-connect", onOpenWalletEvent);
    return () => {
      window.removeEventListener("shaggy:open-wallet-connect", onOpenWalletEvent);
    };
  }, [handleConnectWalletConnect]);

  // Connect via Injected MetaMask Extension or MetaMask Mobile in-app browser
  const handleConnectExtension = async () => {
    setConnectError(null);
    setShowExtensionHelp(false);
    setIsCheckingExtension(true);
    try {
      const provider = await metaMaskConnector?.getProvider();
      setIsMetaMaskInjected(Boolean(provider));
      if (!metaMaskConnector || !provider) {
        setShowExtensionHelp(true);
        return;
      }

      connect(
        { connector: metaMaskConnector },
        {
          onSuccess: () => setIsOpen(false),
          onError: (err) => {
            setConnectError(err.message || "MetaMask extension connection failed.");
          },
        }
      );
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : "MetaMask extension connection failed.");
    } finally {
      setIsCheckingExtension(false);
    }
  };

  // Connect via Coinbase Wallet
  const handleConnectCoinbase = () => {
    setConnectError(null);
    setShowExtensionHelp(false);

    if (!coinbaseConnector) {
      setConnectError("Coinbase Wallet connector is not available.");
      return;
    }

    connect(
      { connector: coinbaseConnector },
      {
        onSuccess: () => setIsOpen(false),
        onError: (err) => {
          setConnectError(err.message || "Coinbase Wallet connection failed.");
        },
      }
    );
  };

  // Open the DEX in default browser for desktop users wanting their browser extension
  const handleOpenInBrowser = () => {
    if (typeof window !== "undefined") {
      window.open(window.location.href, "_blank");
    }
  };

  const handleCopyUri = async () => {
    const valueToCopy = qrMode === "dapp" ? buildMetaMaskDappLink() : wcUri;
    if (!valueToCopy || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(valueToCopy);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    } catch {
      // Ignore clipboard permission errors
    }
  };

  const dappUniversalLink = useMemo(() => buildMetaMaskDappLink(), [isOpen]);

  const activeQrPayload = useMemo(() => {
    if (qrMode === "dapp") {
      return dappUniversalLink;
    }
    if (!wcUri) {
      return null;
    }
    if (qrMode === "camera") {
      return buildMetaMaskWcUniversalLink(wcUri);
    }
    return wcUri;
  }, [qrMode, wcUri, dappUniversalLink]);

  const qrDataUrl = useMemo(() => {
    if (!activeQrPayload) return null;
    try {
      return buildQrSvgDataUrl(activeQrPayload);
    } catch {
      return null;
    }
  }, [activeQrPayload]);

  // Add SD Token to connected wallet
  const handleAddSdToken = async () => {
    try {
      const provider = (await activeConnector?.getProvider()) as
        | { request: (args: unknown) => Promise<unknown> }
        | undefined;
      const eth =
        provider ||
        (window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } })
          ?.ethereum;

      if (eth) {
        await eth.request({
          method: "wallet_watchAsset",
          params: {
            type: "ERC20",
            options: {
              address: "0x051c758521971f5c5a84edaf18eea12854375469",
              symbol: "SD",
              decimals: 18,
            },
          },
        });
      }
    } catch (err) {
      console.error("Failed to watch asset:", err);
    }
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center justify-end space-x-2">
        <div className="flex items-center space-x-2 rounded-xl border border-purple-200 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur-sm">
          <div className="size-2.5 animate-pulse rounded-full bg-green-500" />
          <div className="text-left">
            <p className="text-xs font-semibold leading-none text-gray-900">
              {address.slice(0, 6)}...{address.slice(-4)}
            </p>
            <div className="mt-1 flex items-center space-x-1.5">
              <Badge
                variant={chain?.id === 8453 ? "default" : "secondary"}
                className={
                  chain?.id === 8453
                    ? "h-4 bg-blue-600 px-1.5 py-0 text-[10px] font-semibold text-white"
                    : "h-4 px-1.5 py-0 text-[10px]"
                }
              >
                {chain?.id === 8453 ? "Base" : chain?.name || "Unknown Chain"}
              </Badge>
              <span className="text-[11px] text-gray-600">
                {balance ? parseFloat(balance.formatted).toFixed(4) : "0.0000"}{" "}
                {balance?.symbol || "ETH"}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1 border-l border-gray-200 pl-2">
            {chain?.id !== 8453 && (
              <Button
                variant="default"
                size="sm"
                onClick={() => switchChain({ chainId: 8453 })}
                disabled={isSwitchingChain}
                className="h-7 bg-blue-600 px-2 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700"
                title="Switch to Base Mainnet"
              >
                {isSwitchingChain ? "Switching..." : "Switch to Base"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddSdToken}
              title="Add SD token to wallet"
              className="h-7 border-purple-300 bg-white/80 px-2 text-[11px] font-semibold text-purple-700 hover:bg-purple-100"
            >
              + SD
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => disconnect()}
              title="Disconnect Wallet"
              className="size-7 p-0 text-gray-500 hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end">
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) {
            setShowQrView(false);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button className="flex h-9 items-center space-x-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 font-medium text-white shadow-md hover:from-purple-700 hover:to-pink-700">
            <Wallet className="size-4" />
            <span>{isPending ? "Connecting..." : "Connect Wallet"}</span>
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-xl font-bold text-transparent">
              {showQrView ? "MetaMask Mobile QR Login" : "Connect Your Wallet"}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {showQrView
                ? "Scan with your Android phone or tap below to connect MetaMask Mobile to Shaggy Mutt DEX."
                : "Choose how you want to connect to Shaggy Mutt DEX."}
            </DialogDescription>
          </DialogHeader>

          {showQrView ? (
            <div className="space-y-3.5 pt-1">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowQrView(false);
                    setConnectError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-purple-700"
                >
                  <ArrowLeft className="size-3.5" />
                  <span>All wallet options</span>
                </button>
                <Badge
                  variant="outline"
                  className="border-purple-300 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700"
                >
                  Android &amp; iOS Ready
                </Badge>
              </div>

              {/* QR Mode Switcher for MetaMask In-App Scanner vs Android Native Camera */}
              <div
                role="tablist"
                aria-label="QR Code Scan Mode"
                className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1 text-xs"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={qrMode === "wc"}
                  onClick={() => setQrMode("wc")}
                  className={`rounded-md px-2 py-1.5 font-semibold transition ${
                    qrMode === "wc"
                      ? "shadow-xs bg-white text-purple-700"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  MetaMask Scanner
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={qrMode === "camera"}
                  onClick={() => setQrMode("camera")}
                  className={`rounded-md px-2 py-1.5 font-semibold transition ${
                    qrMode === "camera"
                      ? "shadow-xs bg-white text-purple-700"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Phone Camera
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={qrMode === "dapp"}
                  onClick={() => setQrMode("dapp")}
                  className={`rounded-md px-2 py-1.5 font-semibold transition ${
                    qrMode === "dapp"
                      ? "shadow-xs bg-white text-purple-700"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Open Swap on Phone
                </button>
              </div>

              {/* QR Code Display Box */}
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-purple-200 bg-gradient-to-b from-purple-50/60 to-white p-4 shadow-inner">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="MetaMask Mobile QR Code"
                    className="size-56 rounded-xl border border-purple-100 bg-white p-2 shadow-sm"
                  />
                ) : (
                  <div className="flex size-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-purple-200 bg-white p-4 text-center">
                    {isGeneratingQr ? (
                      <>
                        <Loader2 className="size-7 animate-spin text-purple-600" />
                        <span className="text-xs font-medium text-gray-600">
                          Generating secure WalletConnect QR code...
                        </span>
                      </>
                    ) : (
                      <>
                        <QrCode className="size-8 text-purple-400" />
                        <span className="text-xs text-gray-500">
                          Click &ldquo;New QR Code&rdquo; below to generate a fresh pairing code.
                        </span>
                      </>
                    )}
                  </div>
                )}

                <p className="mt-3 text-center text-xs leading-relaxed text-gray-600">
                  {qrMode === "wc" &&
                    "Open the MetaMask app on your Android phone, tap the QR scanner icon in the top-right corner, and scan this code."}
                  {qrMode === "camera" &&
                    "Point your Android phone's native Camera app at this QR code to launch MetaMask Mobile and approve login."}
                  {qrMode === "dapp" &&
                    "Scan with your Android phone's Camera app to open dex.lumsian.com/swap directly inside the MetaMask Mobile browser."}
                </p>
              </div>

              {/* Copy & Refresh Controls */}
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyUri()}
                  disabled={!activeQrPayload}
                  className="flex-1 text-xs"
                >
                  {copiedUri ? (
                    <>
                      <Check className="mr-1.5 size-3.5 text-green-600" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 size-3.5" />
                      <span>Copy QR Link</span>
                    </>
                  )}
                </Button>
                {qrMode !== "dapp" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleConnectWalletConnect(true)}
                    disabled={isGeneratingQr}
                    className="flex-1 text-xs"
                  >
                    <RefreshCw
                      className={`mr-1.5 size-3.5 ${isGeneratingQr ? "animate-spin" : ""}`}
                    />
                    <span>New QR Code</span>
                  </Button>
                )}
              </div>

              {/* Direct Mobile App Launchers (for users already on Android / mobile) */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3 text-xs">
                <p className="font-semibold text-purple-950">
                  Already on your Android phone? Connect without scanning:
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {wcUri && (
                    <a
                      href={
                        isMobileDevice
                          ? buildMetaMaskWcDeepLink(wcUri)
                          : buildMetaMaskWcUniversalLink(wcUri)
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shadow-xs inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2 font-semibold text-white transition hover:from-purple-700 hover:to-pink-700"
                    >
                      <Smartphone className="size-3.5" />
                      <span>Pair MetaMask App</span>
                    </a>
                  )}
                  <a
                    href={dappUniversalLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3 py-2 font-semibold text-purple-800 transition hover:bg-purple-100"
                  >
                    <ExternalLink className="size-3.5" />
                    <span>Open in MetaMask Browser</span>
                  </a>
                </div>
              </div>

              {(connectError || error) && (
                <div className="flex items-center space-x-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{connectError || error?.message || "Wallet connection failed."}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {/* Option 1: MetaMask Mobile / QR Code (via WalletConnect) */}
              <button
                type="button"
                onClick={() => void handleConnectWalletConnect()}
                className="group flex w-full items-center justify-between rounded-xl border border-purple-200 bg-purple-50/60 p-3.5 text-left transition-all hover:border-purple-300 hover:bg-purple-100/70"
              >
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-gradient-to-br from-purple-600 to-pink-600 p-2.5 text-white shadow-sm">
                    <QrCode className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-900 group-hover:text-purple-700">
                        MetaMask Mobile (QR Code)
                      </span>
                      <Badge
                        variant="outline"
                        className="border-purple-300 bg-purple-100 px-1.5 py-0 text-[10px] text-purple-700"
                      >
                        Mobile Wallet
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Scan QR code with your Android phone or pair with the MetaMask Mobile app
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-gray-400 transition-colors group-hover:text-purple-600" />
              </button>

              {/* Option 2: MetaMask Browser Extension (Injected) */}
              <button
                type="button"
                onClick={() => void handleConnectExtension()}
                disabled={isPending || isCheckingExtension}
                className="group flex w-full items-center justify-between rounded-xl border border-gray-200 p-3.5 text-left transition-all hover:border-purple-200 hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-amber-500 p-2.5 text-white shadow-sm">
                    <Wallet className="size-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-900 group-hover:text-purple-700">
                        MetaMask Browser Extension
                      </span>
                      {isMetaMaskInjected && (
                        <Badge
                          variant="outline"
                          className="border-green-300 bg-green-100 px-1.5 py-0 text-[10px] text-green-700"
                        >
                          Detected
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {isMetaMaskInjected
                        ? "Connect via your installed browser extension or in-app wallet"
                        : isElectron
                          ? "Not in desktop app — click to view options"
                          : "Requires MetaMask browser extension or MetaMask in-app browser"}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-gray-400 transition-colors group-hover:text-purple-600" />
              </button>

              {/* Extension guidance banner if clicked without extension */}
              {showExtensionHelp && (
                <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                  <div className="flex items-start space-x-2">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                    <p className="text-amber-800">
                      {isElectron
                        ? "Browser extensions are not loaded inside this desktop app. Open this page in your regular browser with MetaMask installed, or use MetaMask Mobile (QR Code)."
                        : "MetaMask is not available in this browser window. Open this URL in the browser profile where MetaMask is installed, enable its access to this site, then reload. You can also use MetaMask Mobile (QR Code)."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isElectron && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleOpenInBrowser}
                        className="flex h-7 flex-1 items-center justify-center space-x-1.5 border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-100"
                      >
                        <ExternalLink className="size-3" />
                        <span>Open in Default Browser</span>
                      </Button>
                    )}
                    <a
                      href={dappUniversalLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border border-purple-300 bg-white px-2.5 text-xs font-semibold text-purple-800 hover:bg-purple-50"
                    >
                      <Smartphone className="size-3" />
                      <span>Open in MetaMask Mobile</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Option 3: Coinbase Wallet */}
              {coinbaseConnector && (
                <button
                  type="button"
                  onClick={handleConnectCoinbase}
                  disabled={isPending}
                  className="group flex w-full items-center justify-between rounded-xl border border-gray-200 p-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/40"
                >
                  <div className="flex items-center space-x-3">
                    <div className="rounded-lg bg-blue-600 p-2 text-white shadow-sm">
                      <Smartphone className="size-4" />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">
                        Coinbase Wallet
                      </span>
                      <p className="text-[11px] text-gray-500">
                        Connect via Coinbase Smart Wallet or app
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-gray-400 transition-colors group-hover:text-blue-600" />
                </button>
              )}

              {/* Connection error display */}
              {(connectError || error) && (
                <div className="flex items-center space-x-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-600">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{connectError || error?.message || "Wallet connection failed."}</span>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WalletConnect;
