// src/pages/Stake.tsx
import { useMemo, useState } from 'react';
import type { Address } from 'viem';
import { parseUnits } from 'viem';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

import { publicClient, walletClient, SDT, FDS } from '../lib/viemClients';
import type { Account } from 'viem';
import { signAndDepositWithPermit } from '@/lib/permit';

interface StakeFormState {
  amount: string;         // human amount, e.g. "1.5"
  deadlineMins: number;   // minutes from now
  txHash?: string;
  error?: string;
  isSubmitting: boolean;
}

interface TokenConfig {
  address: Address;
  decimals: bigint;       // keep as bigint to avoid accidental downcasting
  name: string;
  version: string;        // EIP-2612 domain version (OZ default "1")
}

const DEFAULT_TOKEN: TokenConfig = {
  address: SDT.address,
  decimals: 18n,
  name: 'ShaggyDoggToken',
  version: '1',
};

export default function Stake() {
  const [form, setForm] = useState<StakeFormState>({
    amount: '',
    deadlineMins: 10,
    isSubmitting: false,
  });

  const tokenCfg = useMemo<TokenConfig>(() => DEFAULT_TOKEN, []);
  const canStake = Boolean(walletClient && (walletClient.account as Account | undefined)?.address);

  async function handleStakeWithPermit(): Promise<void> {
    setForm((s) => ({ ...s, error: "", txHash: "", isSubmitting: true }));

    if (!walletClient || !walletClient.account) {
      setForm((s) => ({ ...s, isSubmitting: false, error: 'Connect a wallet first.' }));
      return;
    }
    const owner = (walletClient.account as Account).address;
    const raw = form.amount.trim();
    if (!raw || Number(raw) <= 0) {
      setForm((s) => ({ ...s, isSubmitting: false, error: 'Enter a positive amount.' }));
      return;
    }

    try {
      const value = parseUnits(raw, Number(tokenCfg.decimals)); // SDT = 18
      const deadline = BigInt(Math.floor(Date.now() / 1000) + form.deadlineMins * 60);

      const txHash = await signAndDepositWithPermit({
        publicClient,
        walletClient,
        token: tokenCfg.address,
        staking: FDS.address,
        owner,
        value,
        deadline,
        tokenName: tokenCfg.name,
        version: tokenCfg.version,
      });

      setForm((s) => ({ ...s, isSubmitting: false, txHash }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to stake with permit.';
      setForm((s) => ({ ...s, isSubmitting: false, error: msg }));
    }
  }

  return (
    <div className="max-w-xl mx-auto">
      <Card className="bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Stake SDT (via Permit)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canStake && (
            <div className="rounded border border-amber-200 bg-amber-50 text-amber-800 text-sm p-2">
              Connect a wallet (e.g., MetaMask) to sign and send the transaction.
            </div>
          )}
          {form.error && (
            <div className="rounded border border-red-200 bg-red-50 text-red-700 text-sm p-2">
              {form.error}
            </div>
          )}
          {form.txHash && (
            <div className="rounded border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm p-2 break-all">
              Sent! Tx: {form.txHash}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="stake-amount">Amount (SDT)</Label>
              <Input
                id="stake-amount"
                value={form.amount}
                onChange={(e) => setForm((s) => ({ ...s, amount: e.currentTarget.value }))}
                placeholder="1.5"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="stake-deadline">Deadline (minutes)</Label>
              <Input
                id="stake-deadline"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.deadlineMins}
                onChange={(e) => {
                  const n = Number(e.currentTarget.value);
                  setForm((s) => ({
                    ...s,
                    deadlineMins: Number.isFinite(n) && n > 0 ? n : s.deadlineMins,
                  }));
                }}
                placeholder="10"
              />
            </div>
          </div>

          <Button
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            onClick={() => void handleStakeWithPermit()}
            disabled={!canStake || form.isSubmitting}
          >
            {form.isSubmitting ? (
              <span className="inline-flex items-center">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Staking…
              </span>
            ) : (
              'Stake with Permit'
            )}
          </Button>

          <p className="text-xs text-gray-500">
            This uses EIP-2612 to sign an approval and stake in one transaction (`depositWithPermit`).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
