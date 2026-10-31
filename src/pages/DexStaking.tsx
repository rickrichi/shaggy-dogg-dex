import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleDollarSign,
  ExternalLink,
  GitBranch,
  Import,
  Layers3,
  Loader2,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { type Address, formatUnits, getAddress, isAddress } from "viem";
import { useAccount, useChainId, usePublicClient, useSwitchChain } from "wagmi";

import { DexPoolPlanner } from "@/components/DexPoolPlanner";
import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { MrwdLpStakerPanel } from "@/components/MrwdLpStakerPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WalletConnect } from "@/components/WalletConnect";
import {
  BASE_DEX_VENUES,
  MRWD_ADDRESS,
  MRWD_UNISWAP_V3_POOL,
  poolPlannerForVenue,
  USDC_ADDRESS,
  WETH_ADDRESS,
} from "@/config/dex-venues";
import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import {
  type PoolCheckState,
  useDexPoolMatrix,
} from "@/hooks/useDexPoolMatrix";
import { cn } from "@/lib/utils";

const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
interface WalletToken {
  id: string;
  address: Address;
  poolAddress: Address;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  native?: boolean;
}
interface PortfolioTokens {
  tokens: WalletToken[];
  failedChecks: number;
}

export const isValidImportedTokenMetadata = (
  symbol: string,
  name: string,
  decimals: number,
) =>
  Boolean(symbol.trim()) &&
  symbol.length <= 24 &&
  Boolean(name.trim()) &&
  name.length <= 80 &&
  decimals <= 36;

export const reconcileSelectedTokenId = (
  selectedId: string | undefined,
  ids: readonly string[],
) => (selectedId && ids.includes(selectedId) ? selectedId : ids[0]);

export const isCanonicalMrwdSelection = (
  token: Address | undefined,
  venue: string,
  poolAddresses: readonly Address[],
) =>
  token?.toLowerCase() === MRWD_ADDRESS.toLowerCase() &&
  venue === "Uniswap V3" &&
  poolAddresses.some(
    (pool) => pool.toLowerCase() === MRWD_UNISWAP_V3_POOL.toLowerCase(),
  );
const tone: Record<PoolCheckState | "loading", string> = {
  live: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300",
  inactive:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  missing:
    "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
  unsupported:
    "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
  error:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300",
  partial:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300",
  loading:
    "border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300",
};
const label: Record<PoolCheckState | "loading", string> = {
  live: "Active liquidity",
  inactive: "No active liquidity",
  partial: "Partial result",
  missing: "No direct pool",
  unsupported: "Check unsupported",
  error: "RPC check failed",
  loading: "Checking on-chain",
};
const short = (address: Address) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export default function DexStaking() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: 8453 });
  const { switchChain } = useSwitchChain();
  const [imports, setImports] = useState<WalletToken[]>([]);
  const [importAddress, setImportAddress] = useState("");
  const [importError, setImportError] = useState("");
  const [importPending, setImportPending] = useState(false);
  const importSequence = useRef(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedVenue, setSelectedVenue] = useState("Uniswap V3");
  const [search, setSearch] = useState("");
  const detailRef = useRef<HTMLElement>(null);
  const portfolio = useQuery({
    queryKey: ["base-liquidity-token-balances", address],
    enabled: Boolean(address && client),
    queryFn: async (): Promise<PortfolioTokens> => {
      if (!address || !client) return { tokens: [], failedChecks: 0 };
      const configured = BASE_MAINNET_TOKENS.filter(
        (token) => token.kind === "erc20",
      );
      const balances = await client.multicall({
        allowFailure: true,
        contracts: configured.map((token) => ({
          address: token.address,
          abi: ERC20_ABI,
          functionName: "balanceOf" as const,
          args: [address],
        })),
      });
      const failedChecks = balances.filter(
        (result) => result.status === "failure",
      ).length;
      const erc20s = configured.flatMap((token, i) => {
        const result = balances[i];
        const balance = result?.status === "success" ? result.result : 0n;
        return balance > 0n
          ? [
              {
                id: `erc20:${token.address.toLowerCase()}`,
                address: token.address,
                poolAddress: token.address,
                symbol: token.symbol,
                name: token.name,
                decimals: token.decimals,
                balance,
              },
            ]
          : [];
      });
      let eth: bigint | undefined;
      try {
        eth = await client.getBalance({ address });
      } catch {
        eth = undefined;
      }
      return {
        tokens: [
          ...(eth && eth > 0n
            ? [
                {
                  id: "native:eth",
                  address: WETH_ADDRESS,
                  poolAddress: WETH_ADDRESS,
                  symbol: "ETH",
                  name: "Ether (checked as WETH)",
                  decimals: 18,
                  balance: eth,
                  native: true,
                },
              ]
            : []),
          ...erc20s,
        ],
        failedChecks: failedChecks + (eth === undefined ? 1 : 0),
      };
    },
  });
  const tokens = useMemo(() => {
    const map = new Map<string, WalletToken>();
    for (const token of [...(portfolio.data?.tokens ?? []), ...imports])
      map.set(token.id, token);
    return [...map.values()];
  }, [imports, portfolio.data]);
  useEffect(() => {
    setImports([]);
    setSelectedId(undefined);
    setImportError("");
    setImportPending(false);
    importSequence.current += 1;
  }, [address]);
  useEffect(() => {
    const reconciled = reconcileSelectedTokenId(
      selectedId,
      tokens.map((token) => token.id),
    );
    if (reconciled !== selectedId) setSelectedId(reconciled);
  }, [selectedId, tokens]);
  const selectedToken = tokens.find((token) => token.id === selectedId);
  const queryToken = selectedToken?.poolAddress;
  const quote =
    queryToken?.toLowerCase() === WETH_ADDRESS.toLowerCase()
      ? USDC_ADDRESS
      : WETH_ADDRESS;
  const quoteSymbol = quote === USDC_ADDRESS ? "USDC" : "WETH";
  const matrix = useDexPoolMatrix(queryToken, quote);
  const selectedResult = matrix.data?.find(
    (result) => result.venue.name === selectedVenue,
  );
  const state = matrix.isLoading
    ? "loading"
    : (selectedResult?.state ?? "unsupported");
  const poolPlanner = poolPlannerForVenue(selectedVenue);
  const canonical = isCanonicalMrwdSelection(
    queryToken,
    selectedVenue,
    selectedResult?.pools.map((pool) => pool.address) ?? [],
  );
  const importToken = async () => {
    setImportError("");
    if (!address || !client)
      return setImportError("Connect a wallet before importing a token.");
    if (!isAddress(importAddress))
      return setImportError("Enter a valid Base ERC-20 contract address.");
    const tokenAddress = getAddress(importAddress);
    if (
      tokens.some(
        (token) =>
          !token.native &&
          token.address.toLowerCase() === tokenAddress.toLowerCase(),
      )
    )
      return setImportError("That token is already in your selector.");
    const requestAccount = address.toLowerCase();
    const sequence = ++importSequence.current;
    setImportPending(true);
    try {
      const code = await client.getCode({ address: tokenAddress });
      if (!code || code === "0x")
        return setImportError(
          "No contract code was found at this Base address.",
        );
      const [symbol, name, decimals, balance] = await Promise.all([
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "symbol",
        }),
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "name",
        }),
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "decimals",
        }),
        client.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        }),
      ]);
      if (
        sequence !== importSequence.current ||
        address.toLowerCase() !== requestAccount
      )
        return;
      if (!isValidImportedTokenMetadata(symbol, name, decimals))
        throw new Error("invalid metadata");
      if (balance <= 0n)
        return setImportError(
          "This wallet does not hold a positive balance of that token.",
        );
      const id = `erc20:${tokenAddress.toLowerCase()}`;
      setImports((current) =>
        current.some((token) => token.id === id)
          ? current
          : [
              ...current,
              {
                id,
                address: tokenAddress,
                poolAddress: tokenAddress,
                symbol: symbol.trim(),
                name: name.trim(),
                decimals,
                balance,
              },
            ],
      );
      setSelectedId(id);
      setImportAddress("");
    } catch {
      if (sequence === importSequence.current)
        setImportError("This contract did not return valid ERC-20 metadata.");
    } finally {
      if (sequence === importSequence.current) setImportPending(false);
    }
  };
  const blocked = !isConnected || chainId !== 8453;
  const filtered = tokens.filter((token) =>
    `${token.symbol} ${token.name} ${token.address}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const balanceFailures = portfolio.data?.failedChecks ?? 0;
  const selectVenue = (name: string) => {
    setSelectedVenue(name);
    if (window.matchMedia?.("(max-width: 639px)").matches)
      requestAnimationFrame(() =>
        detailRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
  };
  const failedVenues =
    matrix.data?.filter(
      (result) => result.state === "error" || result.state === "partial",
    ).length ?? 0;
  const checkedLabel = matrix.dataUpdatedAt
    ? `${failedVenues === BASE_DEX_VENUES.length ? "Check failed" : failedVenues ? "Partial check" : "Checked"} · ${new Date(matrix.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Awaiting check";
  const activePools =
    matrix.data
      ?.flatMap((result) => result.pools)
      .filter((pool) => pool.liquidity === "active").length ?? 0;
  const inactivePools =
    matrix.data
      ?.flatMap((result) => result.pools)
      .filter((pool) => pool.liquidity === "inactive").length ?? 0;
  return (
    <main className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      <LaunchpadNav />
      <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex gap-2">
            <Badge className="border-indigo-200 bg-indigo-50 text-indigo-800">
              Base Mainnet
            </Badge>
            <Badge
              variant="outline"
              className={
                failedVenues
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }
            >
              {checkedLabel}
            </Badge>
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">
            Portfolio Liquidity{" "}
            <span className="text-indigo-600">&amp; Rewards</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Inspect direct pools for any supported token you hold. Pool
            existence and reward verification are separate.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => matrix.refetch()}
          disabled={!queryToken || matrix.isFetching}
        >
          <RefreshCw
            className={cn("mr-2 size-4", matrix.isFetching && "animate-spin")}
          />
          Refresh pools
        </Button>
      </header>
      {blocked ? (
        <section className="border border-indigo-200 bg-indigo-50 p-6 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="flex gap-3">
            <Wallet className="size-5 text-indigo-600" />
            <div>
              <h2 className="font-black">
                {!isConnected ? "Connect your wallet" : "Switch to Base"}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {!isConnected
                  ? "Connect to load positive Base balances and inspect direct pools."
                  : "This explorer reads Base factories. Switch networks to continue."}
              </p>
              <div className="mt-4">
                {!isConnected ? (
                  <WalletConnect />
                ) : (
                  <Button onClick={() => switchChain({ chainId: 8453 })}>
                    Switch to Base
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section
          aria-label="Wallet token command bar"
          className="border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"
        >
          <p className="mb-4 text-xs font-semibold text-slate-500">
            Connected wallet · {address ? short(address) : "unavailable"}
          </p>
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="min-w-0">
              <label
                htmlFor="token-search"
                className="text-xs font-black uppercase tracking-[.16em] text-indigo-600"
              >
                Portfolio token
              </label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-3 size-4 text-slate-400" />
                <Input
                  id="token-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol, name, or address"
                  className="pl-9"
                />
              </div>
              {portfolio.isLoading ? (
                <p className="mt-3 flex gap-2 text-sm text-slate-500">
                  <Loader2 className="size-4 animate-spin" />
                  Loading positive balances…
                </p>
              ) : portfolio.isError ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-red-700">
                  <span>Could not load wallet balances.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => portfolio.refetch()}
                  >
                    Retry
                  </Button>
                </div>
              ) : filtered.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {filtered.map((token) => (
                    <button
                      key={token.id}
                      type="button"
                      aria-pressed={selectedId === token.id}
                      onClick={() => setSelectedId(token.id)}
                      className={cn(
                        "border px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-indigo-500",
                        selectedId === token.id
                          ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50"
                          : "border-slate-200 dark:border-slate-700",
                      )}
                    >
                      <b className="block max-w-36 truncate text-sm">
                        {token.symbol}
                      </b>
                      <span className="block text-[11px] text-slate-500">
                        {Number(
                          formatUnits(token.balance, token.decimals),
                        ).toLocaleString(undefined, {
                          maximumSignificantDigits: 6,
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              ) : search ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                  <span>No tokens match your search.</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSearch("")}
                  >
                    Clear search
                  </Button>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  {portfolio.data?.failedChecks
                    ? "Some balances could not be checked. Retry before concluding this wallet is empty."
                    : "No positive supported balances found. Import a Base ERC-20."}
                </p>
              )}
              {!portfolio.isLoading &&
                !portfolio.isError &&
                balanceFailures > 0 && (
                  <div
                    role="status"
                    className="mt-3 flex flex-wrap items-center gap-2 border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  >
                    <span>
                      {balanceFailures} balance{" "}
                      {balanceFailures === 1 ? "read" : "reads"} failed.
                      Successful holdings are shown, but this list may be
                      incomplete.
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => portfolio.refetch()}
                      disabled={portfolio.isFetching}
                    >
                      <RefreshCw
                        className={cn(
                          "mr-1 size-3",
                          portfolio.isFetching && "animate-spin",
                        )}
                      />
                      Retry balances
                    </Button>
                  </div>
                )}
            </div>
            <div className="min-w-0 border-slate-200 lg:border-l lg:pl-5 dark:border-slate-800">
              <label
                htmlFor="custom-token"
                className="text-xs font-black uppercase tracking-[.16em]"
              >
                Import custom token
              </label>
              <div className="mt-2 flex gap-2">
                <Input
                  id="custom-token"
                  value={importAddress}
                  onChange={(e) => setImportAddress(e.target.value)}
                  placeholder="0x… ERC-20 address"
                  aria-invalid={Boolean(importError)}
                  aria-describedby={
                    importError ? "custom-token-error" : undefined
                  }
                />
                <Button
                  onClick={importToken}
                  disabled={!importAddress || importPending}
                >
                  {importPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Import className="mr-2 size-4" />
                  )}
                  {importPending ? "Checking" : "Import"}
                </Button>
              </div>
              {importError && (
                <p
                  id="custom-token-error"
                  role="alert"
                  className="mt-2 text-xs font-semibold text-red-700"
                >
                  {importError}
                </p>
              )}
              {selectedToken && (
                <dl className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-slate-500">Selected</dt>
                  <dd className="break-words font-bold">
                    {selectedToken.name}
                  </dd>
                  <dt className="text-slate-500">Contract</dt>
                  <dd className="truncate font-mono">
                    {selectedToken.native
                      ? "Native ETH → WETH for pools"
                      : short(selectedToken.address)}
                  </dd>
                  <dt className="text-slate-500">Direct pair</dt>
                  <dd className="font-bold">
                    {selectedToken.symbol}/{quoteSymbol}
                  </dd>
                </dl>
              )}
            </div>
          </div>
        </section>
      )}
      {selectedToken && !blocked && (
        <>
          <section
            aria-label="Route pool rewards explanation"
            className="grid border border-indigo-200 bg-white dark:bg-slate-950 md:grid-cols-[1fr_auto_1fr_auto_1fr]"
          >
            {([
              [Route, "01 · Route", "The swap engine supports this venue."],
              [
                Layers3,
                "02 · Pool",
                `${selectedToken.symbol}/${quoteSymbol} is checked directly at its factory.`,
              ],
              [
                CircleDollarSign,
                "03 · Rewards",
                "A separate verified program must fund rewards.",
              ],
            ] as const).map(([Icon, title, copy], i) => (
              <div className="contents" key={String(title)}>
                {i > 0 && (
                  <ArrowRight className="m-auto hidden size-5 text-indigo-300 md:block" />
                )}
                <div className="flex gap-3 p-5">
                  <span className="flex size-10 shrink-0 items-center justify-center bg-indigo-600 text-white">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-black uppercase">
                      {String(title)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {String(copy)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </section>
          <section className="grid grid-cols-2 border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-4">
            {[
              [String(BASE_DEX_VENUES.length), "Routing venues"],
              [String(activePools), "Pools with active liquidity"],
              [String(inactivePools), "Pools without active liquidity"],
              [String(failedVenues), "Venues with partial/failing checks"],
            ].map(([v, l]) => (
              <div
                key={l}
                className="border-l border-slate-200 p-4 first:border-l-0 dark:border-slate-800"
              >
                <p className="text-2xl font-black text-indigo-700 dark:text-indigo-300">
                  {matrix.isLoading ? "—" : v}
                </p>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {l}
                </p>
              </div>
            ))}
          </section>
          <section>
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-600">
                Venue ledger
              </p>
              <h2 className="text-xl font-black">
                Direct {selectedToken.symbol}/{quoteSymbol} pools
              </h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {BASE_DEX_VENUES.map((venue) => {
                const result = matrix.data?.find(
                  (r) => r.venue.name === venue.name,
                );
                const s = matrix.isLoading
                  ? "loading"
                  : (result?.state ?? "unsupported");
                return (
                  <button
                    key={venue.name}
                    type="button"
                    aria-label={`${venue.name}. Route supported; pool ${label[s].toLowerCase()}; rewards not verified.`}
                    aria-pressed={selectedVenue === venue.name}
                    aria-controls="venue-detail"
                    onClick={() => selectVenue(venue.name)}
                    className={cn(
                      "border-l-4 bg-white p-4 text-left shadow-sm ring-1 focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-950",
                      selectedVenue === venue.name
                        ? "border-l-indigo-600 ring-indigo-200"
                        : "border-l-transparent ring-slate-200 dark:ring-slate-800",
                    )}
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <b>{venue.name}</b>
                        <p className="text-xs text-slate-500">
                          {venue.ammType}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", tone[s])}
                      >
                        {label[s]}
                      </Badge>
                    </div>
                    <div
                      aria-hidden="true"
                      className="mt-4 flex items-center gap-1.5 text-[11px] font-bold uppercase"
                    >
                      <Check className="size-4 text-indigo-600" />
                      Route
                      <ArrowRight className="size-3 text-slate-300" />
                      <Layers3
                        className={cn(
                          "size-4",
                          s === "live" ? "text-emerald-600" : "text-slate-400",
                        )}
                      />
                      Pool
                      <ArrowRight className="size-3 text-slate-300" />
                      <CircleDollarSign className="size-4 text-amber-600" />
                      Rewards
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
          <section
            id="venue-detail"
            ref={detailRef}
            tabIndex={-1}
            aria-live="polite"
            className="scroll-mt-4 border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="grid gap-6 p-6 lg:grid-cols-[1fr_22rem]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-black">{selectedVenue}</h2>
                  <Badge variant="outline" className={tone[state]}>
                    {label[state]}
                  </Badge>
                  {canonical && (
                    <Badge className="bg-indigo-600">
                      <ShieldCheck className="mr-1 size-3" />
                      Known MRWD program
                    </Badge>
                  )}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {canonical
                    ? "This is the canonical MRWD incentive pool. The controls show wallet positions and contract-reported reward data; they do not independently certify the incentive's current funding or time window."
                    : (selectedResult?.venue.rewardNote ??
                      "Reward status is not verified. Pool discovery alone does not prove a rewards program.")}
                </p>
                {(state === "error" || state === "partial") && (
                  <p className="mt-3 flex gap-2 text-sm text-red-700">
                    <AlertTriangle className="size-4" />
                    Some reads failed; unknown results are not treated as
                    missing or inactive.
                  </p>
                )}
              </div>
              <dl className="border-y border-slate-200 py-3 text-sm dark:border-slate-800">
                <dt className="text-slate-500">Discovered contracts</dt>
                <dd className="mt-2 space-y-2 font-mono text-xs">
                  {selectedResult?.pools.length ? (
                    selectedResult.pools.map((pool) => (
                      <div
                        key={pool.address}
                        className="flex justify-between gap-2"
                      >
                        <a
                          className="text-indigo-700 hover:underline dark:text-indigo-300"
                          target="_blank"
                          rel="noreferrer"
                          href={`https://basescan.org/address/${pool.address}`}
                        >
                          {short(pool.address)}
                          <ExternalLink className="ml-1 inline size-3" />
                        </a>
                        <span>
                          {pool.fee
                            ? `${pool.fee / 10_000}%`
                            : pool.stable === undefined
                              ? "V2"
                              : pool.stable
                                ? "Stable"
                                : "Volatile"}{" "}
                          · {pool.liquidity}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span className="font-sans text-slate-500">
                      {state === "missing"
                        ? "No pool returned by completed checks"
                        : state === "loading"
                          ? "Checking…"
                          : "Unable to confirm contracts"}
                    </span>
                  )}
                </dd>
              </dl>
            </div>
            <div
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 text-sm font-semibold",
                canonical
                  ? "border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40"
                  : "border-amber-200 bg-amber-50 dark:bg-amber-950/30",
              )}
            >
              <span>
                {canonical
                  ? "Known program · inspect contract data in controls"
                  : "Rewards not verified · expect fees only unless confirmed separately"}
              </span>
              {poolPlanner ? (
                <span className="text-cyan-800 dark:text-cyan-300">
                  Guided pool planner below
                </span>
              ) : selectedResult?.venue.actionHref ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={selectedResult.venue.actionHref}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open {selectedVenue}
                    <ExternalLink className="ml-2 size-3" />
                  </a>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Venue action unavailable
                </Button>
              )}
            </div>
          </section>
          {poolPlanner && (
            <DexPoolPlanner
              planner={poolPlanner}
              tokenKey={selectedToken.id}
              tokenName={selectedToken.name}
              tokenSymbol={selectedToken.symbol}
              tokenAddress={selectedToken.address}
              quoteSymbol={quoteSymbol}
              native={Boolean(selectedToken.native)}
              poolExists={Boolean(selectedResult?.pools.length)}
              poolActive={state === "live"}
            />
          )}
          {canonical && (
            <section id="live-staking-controls">
              <MrwdLpStakerPanel />
            </section>
          )}
          <section className="flex gap-3 border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <GitBranch className="size-5 shrink-0 text-indigo-600" />
            <p>
              <strong className="text-slate-900 dark:text-white">
                Liquidity risk:
              </strong>{" "}
              Providing {selectedToken.symbol}/{quoteSymbol} exposes you to
              price divergence, range risk on V3, and smart-contract risk. A
              discovered pool can still have negligible depth.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
