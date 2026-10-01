import { useEffect, useState } from "react";

import { AlertCircle, LogOut, Wallet } from "lucide-react";
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const WalletConnect = () => {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { data: balance } = useBalance({ address });
  const [connectError, setConnectError] = useState<string | null>(null);

  // Add provider check and debug connectors
  useEffect(() => {
    // Debug: log available connectors
    if (import.meta.env.DEV && connectors.length > 0) {
      console.log(
        "Available connectors:",
        connectors.map((c) => ({
          name: c.name,
          id: c.id,
          type: c.type,
        }))
      );
    }
  }, [connectors]);

  // Handle wallet connection
  const handleConnect = () => {
    setConnectError(null);

    const metaMaskConnector = connectors.find(
      (c) => c.id === "metaMaskSDK" || c.name.toLowerCase() === "metamask"
    );

    if (!metaMaskConnector) {
      setConnectError("MetaMask connector is not available. Refresh the page and try again.");
      return;
    }

    console.log("Connecting with connector:", metaMaskConnector.name, metaMaskConnector.id);
    connect(
      { connector: metaMaskConnector },
      {
        onError: (connectionError) => {
          setConnectError(connectionError.message || "MetaMask connection failed.");
        },
      }
    );
  };

  const handleAddSdToken = async () => {
    const eth = (
      window as unknown as { ethereum?: { request: (args: unknown) => Promise<unknown> } }
    )?.ethereum;
    if (eth) {
      try {
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
      } catch (err) {
        console.error("Failed to watch asset:", err);
      }
    }
  };

  if (isConnected && address) {
    return (
      <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="size-3 animate-pulse rounded-full bg-green-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
                <div className="flex items-center space-x-2">
                  <Badge
                    variant={chain?.id === 8453 ? "default" : "secondary"}
                    className={
                      chain?.id === 8453
                        ? "bg-blue-600 text-xs font-semibold text-white"
                        : "text-xs"
                    }
                  >
                    {chain?.id === 8453 ? "Base" : chain?.name || "Unknown Chain"}
                  </Badge>
                  <span className="text-xs text-gray-600">
                    {balance ? parseFloat(balance.formatted).toFixed(4) : "0.0000"}{" "}
                    {balance?.symbol || "ETH"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {chain?.id !== 8453 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => switchChain({ chainId: 8453 })}
                  disabled={isSwitchingChain}
                  className="h-8 bg-blue-600 px-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                  title="Switch to Base Mainnet"
                >
                  {isSwitchingChain ? "Switching..." : "Switch to Base"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddSdToken}
                title="Add SD token to MetaMask"
                className="h-8 border-purple-300 bg-white/80 px-2 text-xs font-semibold text-purple-700 hover:bg-purple-100"
              >
                + SD
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnect()}
                className="h-8 hover:border-red-200 hover:bg-red-50"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-2 border-dashed border-gray-200 bg-gray-50">
        <CardContent className="p-6 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="rounded-full bg-gradient-to-r from-purple-100 to-pink-100 p-3">
              <Wallet className="size-8 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Connect Your Wallet</h3>
              <p className="mt-1 text-sm text-gray-600">
                Connect MetaMask to start trading on Shaggy Mutt DEX
              </p>
            </div>
            <Button
              onClick={handleConnect}
              disabled={isPending}
              className="bg-gradient-to-r from-purple-600 to-pink-600 px-6 font-medium text-white hover:from-purple-700 hover:to-pink-700"
            >
              {isPending ? "Connecting..." : "Connect MetaMask"}
            </Button>
            {(connectError || error) && (
              <p className="mt-2 text-sm text-red-600">
                {connectError || error?.message || "MetaMask connection failed."}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="mt-0.5 size-5 text-amber-600" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">Need MetaMask?</p>
              <p className="text-amber-700">
                Install the MetaMask browser extension to connect your wallet.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WalletConnect;
