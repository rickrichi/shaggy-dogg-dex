// src/pages/Swap.tsx
import { useState } from 'react';
import { useAccount, useBlockNumber } from 'wagmi';
import { Card, CardContent } from '@/components/ui/card';
import { SwapCard } from '@/components/swap/SwapCard';
import { useSwap } from '@/hooks/useSwap';
import { MAINNET_TOKENS } from '@/config/tokens';
import { assertHasAtLeastTwo } from '@/utils/guards';

// Ensure tuple shape at runtime -> narrows to [Token, Token, ...Token[]]
assertHasAtLeastTwo(MAINNET_TOKENS);

export default function Swap() {
  const { isConnected } = useAccount();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [showSettings, setShowSettings] = useState(false);

  // After the assertion, these are Token (not Token | undefined)
  const [baseToken, quoteToken] = MAINNET_TOKENS;
  const swap = useSwap(baseToken, quoteToken);

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto">
        <Card className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-amber-800 mb-3">Wallet Not Connected</h3>
            <p className="text-amber-700">Please connect your wallet to access the swap feature.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="text-center">
        <h1 className="text-4xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-clip-text text-transparent mb-3 animate-gradient">
          Swap Tokens
        </h1>
        <p className="text-gray-600 text-lg">Trade tokens with best rates</p>
      </div>

      <SwapCard
        swap={swap}
        tokens={MAINNET_TOKENS}
        showSettings={showSettings}
        onSettingsChange={setShowSettings}
      />

      {process.env.NODE_ENV === 'development' && blockNumber && (
        <div className="text-center text-xs text-gray-400 font-mono">
          Block: {blockNumber.toString()}
        </div>
      )}
    </div>
  );
}
