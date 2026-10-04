import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveAccounts } from "@/hooks/useLiveAccounts";

import { LiveVenueComparison } from "./LiveVenueComparison";
import { BaseExecutionComparison } from "./BaseExecutionComparison";

// Pairs with both an Alpaca (ARB_ALPACA_SYMBOLS) and a Kraken live book.
type StreamedAccount = ReturnType<typeof useLiveAccounts>["alpacaAccount"];

const LIVE_SYMBOLS = ["BTC/USD", "ETH/USD"] as const;

const usd = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const amount = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 8 });
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

function AccountCard({ venue, account, base }: { venue: string; account: StreamedAccount; base: string }) {
  return (
    <Card className="border-slate-200 bg-white/90">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {venue}
          <Badge className="bg-rose-600 text-white">LIVE</Badge>
          {account?.tradingEnabled === false && <Badge variant="destructive">Trading blocked</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {!account ? (
          <p className="text-slate-500">Waiting for live account telemetry…</p>
        ) : !account.configured ? (
          <p className="text-rose-600">{account.error ?? "Account unavailable"}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={venue === "Kraken" ? "Equity (est.)" : "Equity"} value={usd(account.totalUsdEst)} />
              <Stat label="Cash" value={usd(account.cash)} />
              <Stat label="Available USD" value={usd(account.free.USD ?? 0)} />
              <Stat label={`Available ${base}`} value={amount(account.free[base] ?? 0)} />
            </div>
            {account.takerFee != null && (
              <p className="text-slate-600">
                Fee: crypto tier {account.cryptoTier} · {pct(account.makerFee ?? 0)} maker / {pct(account.takerFee)} taker
                <span className="text-slate-400"> · {account.feeSource}</span>
              </p>
            )}
            {account.endpoint && (
              <p className="text-slate-500">
                Endpoint {account.endpointVerified ? "verified" : "UNVERIFIED"}: {account.endpoint}
              </p>
            )}
            <table className="w-full">
              <thead className="text-slate-400">
                <tr>
                  <th className="text-left font-medium">Asset</th>
                  <th className="text-right font-medium">Available</th>
                  <th className="text-right font-medium">Reserved by orders</th>
                  <th className="text-right font-medium">USD value</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {account.breakdown?.map((row) => (
                  <tr key={row.asset} className={row.asset === base ? "text-indigo-700" : undefined}>
                    <td>{row.asset}</td>
                    <td className="text-right">{amount(row.free)}</td>
                    <td className={`text-right ${row.reserved > 0 ? "text-amber-600" : "text-slate-400"}`}>
                      {amount(row.reserved)}
                    </td>
                    <td className="text-right">{row.usdValue == null ? "unpriced" : usd(row.usdValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="font-mono text-sm font-bold text-slate-900">{value}</div>
    </div>
  );
}

export function LiveDeskTab({ symbol, onSelectSymbol }: { symbol: string; onSelectSymbol: (symbol: string) => void }) {
  const { alpacaAccount, krakenAccount, connected, refresh } = useLiveAccounts();
  const [notional, setNotional] = useState(100);
  const active = (LIVE_SYMBOLS as readonly string[]).includes(symbol) ? symbol : "ETH/USD";
  const base = active.split("/")[0] ?? active;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {LIVE_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSelectSymbol(s)}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                s === active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="space-y-1">
          <Label htmlFor="live-desk-budget" className="text-xs">
            Budget (USD)
          </Label>
          <Input
            id="live-desk-budget"
            type="number"
            min={1}
            value={notional}
            onChange={(e) => {
              const v = e.currentTarget.valueAsNumber;
              if (Number.isFinite(v) && v > 0) setNotional(v);
            }}
            className="w-28"
          />
        </div>
        <span className={`text-xs ${connected ? "text-emerald-600" : "text-amber-600"}`}>
          ● {connected ? "Balances streaming" : "Balances reconnecting…"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountCard venue="Alpaca" account={alpacaAccount} base={base} />
        <AccountCard venue="Kraken" account={krakenAccount} base={base} />
      </div>

      <LiveVenueComparison symbol={active} notional={notional} onExecuted={refresh} />
      {active === "ETH/USD" && <BaseExecutionComparison notional={notional} />}
    </div>
  );
}
