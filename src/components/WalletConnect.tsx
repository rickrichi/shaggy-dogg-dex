import { useEffect, useRef, useState } from "react";

import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  LogOut,
  QrCode,
  Smartphone,
  Wallet,
} from "lucide-react";
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

export const WalletConnect = () => {
  const { address, isConnected, chain, connector: activeConnector } = useAccount();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { data: balance } = useBalance({ address });

  const [isOpen, setIsOpen] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showExtensionHelp, setShowExtensionHelp] = useState(false);
  const [isMetaMaskInjected, setIsMetaMaskInjected] = useState(false);
  const [isCheckingExtension, setIsCheckingExtension] = useState(false);

  const isElectron =
    typeof window !== "undefined" &&
    (navigator.userAgent.toLowerCase().includes("electron") ||
      Boolean((window as unknown as { process?: { type?: string } }).process?.type));

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

  // If the WalletConnect/Reown modal never appears (e.g. its remote config fetch is blocked or
  // rejected), wagmi's own onError doesn't fire — the connector is still "pending" as far as
  // wagmi knows. Without this, closing our modal below leaves the user on a disabled
  // "Connecting..." button with nothing else visible, forever.
  //
  // The fallback timer is cleared the moment Reown's own modal (<w3m-modal> / <appkit-modal>)
  // actually appears in the DOM — not when the connection completes. Scanning a QR code
  // legitimately takes people well over 15 seconds; this only fires when NO modal ever showed.
  const walletConnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walletConnectObserverRef = useRef<MutationObserver | null>(null);
  const clearWalletConnectWatch = () => {
    if (walletConnectTimeoutRef.current) {
      clearTimeout(walletConnectTimeoutRef.current);
      walletConnectTimeoutRef.current = null;
    }
    if (walletConnectObserverRef.current) {
      walletConnectObserverRef.current.disconnect();
      walletConnectObserverRef.current = null;
    }
  };
  useEffect(() => clearWalletConnectWatch, []);

  useEffect(() => {
    if (isConnected) {
      clearWalletConnectWatch();
      setIsOpen(false);
      setConnectError(null);
      setShowExtensionHelp(false);
    }
  }, [isConnected]);

  // Connect via MetaMask Mobile QR Code (WalletConnect)
  const handleConnectWalletConnect = () => {
    setConnectError(null);
    setShowExtensionHelp(false);

    const target = walletConnectConnector || connectors.find((c) => c.type === "walletConnect");
    if (!target) {
      setConnectError(
        "WalletConnect connector is not configured. Check VITE_WALLETCONNECT_PROJECT_ID."
      );
      return;
    }

    setIsOpen(false);
    clearWalletConnectWatch();

    // Reown mounts <w3m-modal>/<appkit-modal> into the DOM at init time regardless of whether
    // it's showing anything — it only adds the "open" class when actually visible. Checking for
    // the element's mere presence (rather than .open) would clear this watch immediately and
    // defeat the whole fallback.
    const modalAppeared = () =>
      Boolean(document.querySelector("w3m-modal.open, appkit-modal.open"));

    if (!modalAppeared()) {
      const observer = new MutationObserver(() => {
        if (modalAppeared()) clearWalletConnectWatch();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      walletConnectObserverRef.current = observer;

      walletConnectTimeoutRef.current = setTimeout(() => {
        clearWalletConnectWatch();
        setConnectError(
          "The WalletConnect QR code didn't load in time. This usually means its configuration " +
            "couldn't be fetched (network or browser restriction). Try again, or use MetaMask " +
            "Browser Extension / Coinbase Wallet instead."
        );
        setIsOpen(true);
      }, 15000);
    }

    connect(
      { connector: target },
      {
        onError: (err) => {
          clearWalletConnectWatch();
          setConnectError(err.message || "Failed to start WalletConnect pairing.");
          setIsOpen(true);
        },
      }
    );
  };

  // Connect via Injected MetaMask Extension
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
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            className="flex h-9 items-center space-x-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-4 font-medium text-white shadow-md hover:from-purple-700 hover:to-pink-700"
            disabled={isPending}
          >
            <Wallet className="size-4" />
            <span>{isPending ? "Connecting..." : "Connect Wallet"}</span>
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-xl font-bold text-transparent">
              Connect Your Wallet
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Choose how you want to connect to Shaggy Mutt DEX.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {/* Option 1: MetaMask Mobile / QR Code (via WalletConnect) */}
            <button
              type="button"
              onClick={handleConnectWalletConnect}
              disabled={isPending}
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
                    Scan QR code with the MetaMask Mobile app on your phone
                  </p>
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-400 transition-colors group-hover:text-purple-600" />
            </button>

            {/* Option 2: MetaMask Browser Extension (Injected) */}
            <button
              type="button"
              onClick={handleConnectExtension}
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
                      ? "Connect via your installed desktop browser extension"
                      : isElectron
                        ? "Not in desktop app — click to view options"
                        : "Requires MetaMask browser extension installed"}
                  </p>
                </div>
              </div>
              <ChevronRight className="size-4 text-gray-400 transition-colors group-hover:text-purple-600" />
            </button>

            {/* Extension guidance banner if clicked inside desktop app without extension */}
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
                {isElectron && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleOpenInBrowser}
                    className="flex h-7 w-full items-center justify-center space-x-1.5 border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-100"
                  >
                    <ExternalLink className="size-3" />
                    <span>Open in Default Browser</span>
                  </Button>
                )}
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
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WalletConnect;
