import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ARB_PRIVATE_API } from "@/config/crypto-arb";
import { useLiveAccounts } from "@/hooks/useLiveAccounts";

import { BaseExecutionComparison } from "./BaseExecutionComparison";
import { LiveVenueComparison } from "./LiveVenueComparison";

import type { Snapshot } from "@/types/crypto-arb";

// Pairs with both an Alpaca (ARB_ALPACA_SYMBOLS) and a Kraken live book.
type StreamedAccount = ReturnType<typeof useLiveAccounts>["alpacaAccount"];

const LIVE_SYMBOLS = ["BTC/USD", "ETH/USD"] as const;

const usd = (value: number) =>
  value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const amount = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 8 });
const pct = (value: number) => `${(value * 100).toFixed(2)}%`;

function AccountCard({
  venue,
  account,
  base,
}: {
  venue: string;
  account: StreamedAccount;
  base: string;
}) {
  return (
    <Card className="border-slate-200 bg-white/90">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {venue}
          {account && (
            <Badge className="bg-rose-600 text-white">
              {account?.mode === "paper" ? "PAPER" : "LIVE"}
            </Badge>
          )}
          {account?.tradingEnabled === false && (
            <Badge variant="destructive">Trading blocked</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {!account ? (
          <p className="text-slate-500">Waiting for live account telemetry…</p>
        ) : !account.configured ? (
          <div className="space-y-2">
            <p className="text-rose-600">{account.error ?? "Account unavailable"}</p>
            <p className="text-slate-500">
              Desktop: open Shaggy-Dogg-Dex → Edit exchange settings, add your keys, then restart.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label={venue === "Kraken" ? "Equity (est.)" : "Equity"}
                value={usd(account.totalUsdEst)}
              />
              <Stat label="Cash" value={usd(account.cash)} />
              <Stat label="Available USD" value={usd(account.free.USD ?? 0)} />
              <Stat label={`Available ${base}`} value={amount(account.free[base] ?? 0)} />
            </div>
            {account.takerFee != null && (
              <p className="text-slate-600">
                Fee: crypto tier {account.cryptoTier} · {pct(account.makerFee ?? 0)} maker /{" "}
                {pct(account.takerFee)} taker
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
                  <tr
                    key={row.asset}
                    className={row.asset === base ? "text-indigo-700" : undefined}
                  >
                    <td>{row.asset}</td>
                    <td className="text-right">{amount(row.free)}</td>
                    <td
                      className={`text-right ${row.reserved > 0 ? "text-amber-600" : "text-slate-400"}`}
                    >
                      {amount(row.reserved)}
                    </td>
                    <td className="text-right">
                      {row.usdValue == null ? "unpriced" : usd(row.usdValue)}
                    </td>
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

function PublicMarketQuotes({ snapshot, symbol }: { snapshot: Snapshot | null; symbol: string }) {
  const books = snapshot?.venues.filter((venue) => venue.symbol === symbol) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{symbol} exchange quotes</CardTitle>
      </CardHeader>
      <CardContent>
        {books.length === 0 ? (
          <p>Public quotes unavailable for {symbol}.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th>Exchange</th>
                <th>Bid (USD)</th>
                <th>Ask (USD)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {books.map((book) => {
                const age = (book.ageMs ?? Infinity) + Math.max(0, Date.now() - snapshot!.ts);
                const state = book.status === "live" && age > 5000 ? "stale" : book.status;
                return (
                  <tr key={book.exchange}>
                    <td>{book.exchange}</td>
                    <td>{book.bid != null && book.bid > 0 ? usd(book.bid) : "—"}</td>
                    <td>{book.ask != null && book.ask > 0 ? usd(book.ask) : "—"}</td>
                    <td>{state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function LiveDeskTab({
  symbol,
  snapshot,
  onSelectSymbol,
}: {
  symbol: string;
  snapshot: Snapshot | null;
  onSelectSymbol: (symbol: string) => void;
}) {
  const { alpacaAccount, krakenAccount, connected, refresh } = useLiveAccounts();
  const [budget, setBudget] = useState("100");
  const notional = Number(budget);
  const valid = Number.isFinite(notional) && notional >= 1 && notional <= 1_000_000;
  const active = symbol.toUpperCase();
  const supported = LIVE_SYMBOLS.some((pair) => pair === active);
  const exactUsdc = /^\d+(?:\.\d{0,6}0*)?$/.test(budget);
  const invalidPrecision = valid && active === "ETH/USD" && !exactUsdc;
  const base = active.split("/")[0] ?? active;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-2">
          {LIVE_SYMBOLS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === active}
              onClick={() => onSelectSymbol(s)}
              className={`rounded-md border px-3 py-1.5 text-xs font-bold ${
                s === active
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {supported && (ARB_PRIVATE_API || active === "ETH/USD") && (
          <div className="space-y-1">
            <Label htmlFor="live-desk-budget" className="text-xs">
              {ARB_PRIVATE_API ? "Budget (USD)" : "Base quote amount (USDC)"}
            </Label>
            <Input
              id="live-desk-budget"
              type="number"
              min={1}
              max={1_000_000}
              step={ARB_PRIVATE_API ? "any" : "0.000001"}
              value={budget}
              aria-invalid={!valid || invalidPrecision}
              aria-describedby={!valid || invalidPrecision ? "live-desk-budget-error" : undefined}
              onChange={(e) => setBudget(e.currentTarget.value)}
              className="w-28"
            />
            {(!valid || invalidPrecision) && (
              <p id="live-desk-budget-error" className="text-xs text-rose-700">
                {invalidPrecision
                  ? "Use a decimal amount with up to six decimal places for the Base USDC quote."
                  : "Enter an amount from 1 to 1,000,000."}
              </p>
            )}
          </div>
        )}
        {ARB_PRIVATE_API && (
          <span className={`text-xs ${connected ? "text-emerald-600" : "text-amber-600"}`}>
            ● {connected ? "Balances streaming" : "Balances reconnecting…"}
          </span>
        )}
      </div>

      {!supported ? (
        <p role="status">The live desk supports BTC/USD and ETH/USD. Select a pair above.</p>
      ) : (
        <>
          {ARB_PRIVATE_API ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <AccountCard venue="Alpaca" account={alpacaAccount} base={base} />
              <AccountCard venue="Kraken" account={krakenAccount} base={base} />
            </div>
          ) : (
            <PublicMarketQuotes snapshot={snapshot} symbol={active} />
          )}

          <LiveVenueComparison
            symbol={active}
            notional={valid ? notional : 0}
            onExecuted={refresh}
          />
          {valid && exactUsdc && active === "ETH/USD" && (
            <BaseExecutionComparison notional={notional} />
          )}
        </>
      )}
    </div>
  );
}
