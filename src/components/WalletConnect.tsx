import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wallet, LogOut, AlertCircle } from 'lucide-react';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { useEffect, useState } from 'react';

export const WalletConnect = () => {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const [hasMetaMask, setHasMetaMask] = useState(true);

  // Add provider check
  useEffect(() => {
    if (typeof window.ethereum === 'undefined') {
      console.log('MetaMask not installed');
      setHasMetaMask(false);
      return;
    }
    setHasMetaMask(true);
  }, []);

  // Handle wallet connection
  const handleConnect = () => {
    const metaMaskConnector = connectors.find(connector => 
      connector.name.toLowerCase().includes('metamask')
    );
    
    const connectorToUse = metaMaskConnector || connectors[0];
    
    if (connectorToUse) {
      connect({ connector: connectorToUse });
    } else {
      console.error('No wallet connectors available');
    }
  };

  if (isConnected && address) {
    return (
      <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-pink-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </p>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className="text-xs">
                    {chain?.name || 'Unknown Chain'}
                  </Badge>
                  <span className="text-xs text-gray-600">
                    {balance ? parseFloat(balance.formatted).toFixed(4) : '0.0000'} {balance?.symbol || 'ETH'}
                  </span>
                </div>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => disconnect()}
              className="hover:bg-red-50 hover:border-red-200"
            >
              <LogOut className="h-4 w-4" />
            </Button>
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
              <Wallet className="h-8 w-8 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Connect Your Wallet</h3>
              <p className="text-sm text-gray-600 mt-1">
                Connect MetaMask to start trading on Shaggy Mutt DEX
              </p>
            </div>
            <Button 
              onClick={handleConnect}
              disabled={isPending || !hasMetaMask || connectors.length === 0}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium px-6"
            >
              {isPending ? 'Connecting...' : 'Connect MetaMask'}
            </Button>
            {!hasMetaMask && (
              <p className="text-red-600 text-sm mt-2">
                MetaMask not detected. Please install MetaMask browser extension.
              </p>
            )}
            {connectors.length === 0 && hasMetaMask && (
              <p className="text-red-600 text-sm mt-2">
                No wallet connectors available. Please check your configuration.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      
      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
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