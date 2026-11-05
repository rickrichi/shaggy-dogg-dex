import { useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Award, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { type Address, formatUnits, type Hex, parseAbi } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WETH_ADDRESS } from "@/config/dex-venues";
import { useStakedPortfolio } from "@/hooks/useStakedPortfolio";
import { MRWD } from "@/lib/mrwd-pro";
import {
  claimBankedCalls,
  claimCalls,
  moveCalls,
  MRWD_V3_STAKER as STAKER,
  selectPeriods,
  stakerActionsAbi,
  type StakerIncentiveKey,
  unstakeCalls,
} from "@/lib/mrwd-staker";

import type { V3Position } from "@/lib/staked-positions";

const sameAddress = (a: Address | undefined, b: Address | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

const SCHEDULER: Address = "0xCAbf284806b800d9A771B55857B9fCF735ea7109";
const NPM: Address = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const POOL: Address = "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5";
const TIMELOCK: Address = "0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25";
const MAX_UINT128 = (1n << 128n) - 1n;

const schedulerAbi = parseAbi([
  "function periodCount() view returns (uint256)",
  "function period(uint256 i) view returns ((uint128 amount, uint64 startTime, uint64 endTime) p, uint8 status)",
  "function incentiveKey(uint256 i) view returns ((address rewardToken, address pool, uint256 startTime, uint256 endTime, address refundee))",
  "function incentiveId(uint256 i) view returns (bytes32)",
]);

const stakerAbi = parseAbi([
  "function getRewardInfo((address rewardToken, address pool, uint256 startTime, uint256 endTime, address refundee) key, uint256 tokenId) view returns (uint256 reward, uint160 secondsInsideX128)",
  "function deposits(uint256 tokenId) view returns (address owner, uint48 numberOfStakes, int24 tickLower, int24 tickUpper)",
  "function stakes(uint256 tokenId, bytes32 incentiveId) view returns (uint160 secondsPerLiquidityInsideInitialX128, uint128 liquidity)",
  "function rewards(address rewardToken, address owner) view returns (uint256)",
  "function incentives(bytes32 incentiveId) view returns (uint256 totalRewardUnclaimed, uint160 totalSecondsClaimedX128, uint96 numberOfStakes)",
]);

const npmAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) returns (uint256 amount0, uint256 amount1)",
]);

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

/** The rewards pool is MRWD/WETH at 0.30%. */
const isRewardPoolPosition = ({ token0, token1, fee }: V3Position) =>
  fee === 3000 &&
  [token0, token1].some((token) => sameAddress(token, MRWD)) &&
  [token0, token1].some((token) => sameAddress(token, WETH_ADDRESS));

const fmtMrwd = (wei: bigint) =>
  Number(formatUnits(wei, 18)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

const fmtDate = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toISOString().replace(".000Z", " UTC").replace("T", " ");

const quarter = (index: number) => `Quarter ${index + 1}`;

const fmtWeth = (wei: bigint) =>
  wei === 0n ? "0 WETH" : `${Number(formatUnits(wei, 18)).toFixed(12)} WETH`;

export function MrwdLpStakerPanel() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: 8453 });
  const { writeContractAsync } = useWriteContract();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmingUnstake, setConfirmingUnstake] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [customId, setCustomId] = useState("");
  const portfolio = useStakedPortfolio(address);
  const tokenIds = useMemo(() => {
    const owned = (portfolio.data?.positions ?? [])
      .filter(isRewardPoolPosition)
      .map((position) => position.tokenId);
    return [...new Set([...owned, ...addedIds])];
  }, [addedIds, portfolio.data]);

  const stakerQuery = useQuery({
    queryKey: ["mrwd-v3-staker-positions", tokenIds.join(","), address],
    enabled: !!client,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [block, count, slot0] = await Promise.all([
        client!.getBlock(),
        client!.readContract({
          address: SCHEDULER,
          abi: schedulerAbi,
          functionName: "periodCount",
        }),
        client!.readContract({
          address: POOL,
          abi: poolAbi,
          functionName: "slot0",
        }),
      ]);
      const periods = await Promise.all(
        Array.from({ length: Number(count) }, async (_, index) => {
          const [p, status] = await client!.readContract({
            address: SCHEDULER,
            abi: schedulerAbi,
            functionName: "period",
            args: [BigInt(index)],
          });
          return { index, startTime: p.startTime, endTime: p.endTime, status };
        })
      );
      const { current, previous, upcoming } = selectPeriods(periods, block.timestamp);
      // The quarter the table reports on: the running one, else the one that just ended.
      const mainIndex = current?.index ?? previous?.index ?? 0;
      // While a quarter runs, positions can still be parked in the one before it.
      const priorIndex = current ? previous?.index : undefined;
      const readIncentive = async (i: number) => {
        const [incentiveKey, incentiveId] = await Promise.all([
          client!.readContract({
            address: SCHEDULER,
            abi: schedulerAbi,
            functionName: "incentiveKey",
            args: [BigInt(i)],
          }),
          client!.readContract({
            address: SCHEDULER,
            abi: schedulerAbi,
            functionName: "incentiveId",
            args: [BigInt(i)],
          }),
        ]);
        return { key: incentiveKey as StakerIncentiveKey, id: incentiveId };
      };
      const [{ key, id: incId }, prior] = await Promise.all([
        readIncentive(mainIndex),
        priorIndex === undefined ? Promise.resolve(null) : readIncentive(priorIndex),
      ]);

      const [incState, bankedRewards] = await Promise.all([
        client!.readContract({
          address: STAKER,
          abi: stakerAbi,
          functionName: "incentives",
          args: [incId],
        }),
        address
          ? client!.readContract({
              address: STAKER,
              abi: stakerAbi,
              functionName: "rewards",
              args: [MRWD, address],
            })
          : Promise.resolve(0n),
      ]);

      const currentTick = slot0[1];
      const loadedRows = await Promise.all(
        tokenIds.map(async (idStr) => {
          const tid = BigInt(idStr);
          const reads = await Promise.all([
            client!.readContract({
              address: NPM,
              abi: npmAbi,
              functionName: "ownerOf",
              args: [tid],
            }),
            client!.readContract({
              address: NPM,
              abi: npmAbi,
              functionName: "positions",
              args: [tid],
            }),
            client!.readContract({
              address: STAKER,
              abi: stakerAbi,
              functionName: "deposits",
              args: [tid],
            }),
            client!.readContract({
              address: STAKER,
              abi: stakerAbi,
              functionName: "stakes",
              args: [tid, incId],
            }),
            prior
              ? client!.readContract({
                  address: STAKER,
                  abi: stakerAbi,
                  functionName: "stakes",
                  args: [tid, prior.id],
                })
              : Promise.resolve([0n, 0n] as const),
          ]).catch(() => null); // A burned or mistyped ID must not hide the other rows.
          if (!reads) return null;
          const [nftHolder, pos, deposit, stake, priorStake] = reads;

          let accruedMrwd = 0n;
          const isStaked = stake[1] > 0n;
          // Parked in the quarter that ended: still holds that quarter's reward, earns nothing new.
          const parkedInPrior = !isStaked && !!prior && priorStake[1] > 0n;
          const stakedKey: StakerIncentiveKey | null = isStaked
            ? key
            : parkedInPrior && prior
              ? prior.key
              : null;
          if (stakedKey) {
            try {
              const rewardInfo = await client!.readContract({
                address: STAKER,
                abi: stakerAbi,
                functionName: "getRewardInfo",
                args: [stakedKey, tid],
              });
              accruedMrwd = rewardInfo[0];
            } catch {
              accruedMrwd = 0n;
            }
          }

          let feeWeth = 0n;
          let feeMrwd = 0n;
          try {
            const sim = await client!.simulateContract({
              address: NPM,
              abi: npmAbi,
              functionName: "collect",
              args: [
                {
                  tokenId: tid,
                  recipient: nftHolder,
                  amount0Max: MAX_UINT128,
                  amount1Max: MAX_UINT128,
                },
              ],
              account: nftHolder,
            });
            feeWeth = sim.result[0];
            feeMrwd = sim.result[1];
          } catch {
            feeWeth = pos[10];
            feeMrwd = pos[11];
          }

          const tickLower = pos[5];
          const tickUpper = pos[6];
          const inRange = currentTick >= tickLower && currentTick < tickUpper;
          const custodyLabel =
            nftHolder.toLowerCase() === STAKER.toLowerCase()
              ? "UniswapV3Staker"
              : nftHolder.toLowerCase() === TIMELOCK.toLowerCase()
                ? "V3PositionTimelock"
                : "Wallet";

          return {
            tokenId: idStr,
            custodyLabel,
            depositOwner: deposit[0],
            tickLower,
            tickUpper,
            inRange,
            isStaked,
            parkedInPrior,
            stakedKey,
            inStaker: sameAddress(nftHolder, STAKER),
            accruedMrwd,
            feeWeth,
            feeMrwd,
          };
        })
      );

      const rows = loadedRows.flatMap((row) => (row ? [row] : []));
      const missingIds = tokenIds.filter((id) => !rows.some((row) => row.tokenId === id));
      const totalAccruedMrwd = rows.reduce((sum, r) => sum + r.accruedMrwd, 0n);
      const totalFeeWeth = rows.reduce((sum, r) => sum + r.feeWeth, 0n);

      return {
        blockNumber: block.number.toString(),
        blockTimestamp: block.timestamp,
        currentTick,
        incentiveId: incId,
        incentiveKey: key,
        mainIndex,
        mainEnd: periods[mainIndex]?.endTime ?? 0n,
        // The staker takes new stakes only while a quarter runs (start <= now < end).
        canStake: !!current,
        upcoming,
        unclaimedPoolMrwd: incState[0],
        activeStakesCount: Number(incState[2]),
        bankedRewards,
        rows,
        missingIds,
        totalAccruedMrwd,
        totalFeeWeth,
      };
    },
  });

  /**
   * Sends staker calls after re-reading the position's owner, so a stale table can't offer a
   * signature to the wrong wallet. The staker enforces ownership itself as well.
   */
  const runStakerCalls = async (
    action: string,
    calls: Hex[],
    success: string,
    tokenIds: string[] = []
  ) => {
    if (!address || !client) {
      toast.error("Connect the wallet that owns this position.");
      return;
    }
    if (chainId !== 8453) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }
    setBusyAction(action);
    try {
      for (const tokenId of tokenIds) {
        const [owner] = await client.readContract({
          address: STAKER,
          abi: stakerAbi,
          functionName: "deposits",
          args: [BigInt(tokenId)],
        });
        if (!sameAddress(owner, address)) {
          throw new Error(`Only the owner of position #${tokenId} can do this.`);
        }
      }
      await client.simulateContract({
        address: STAKER,
        abi: stakerActionsAbi,
        functionName: "multicall",
        args: [calls],
        account: address,
      });
      const hash = await writeContractAsync({
        address: STAKER,
        abi: stakerActionsAbi,
        functionName: "multicall",
        args: [calls],
        chainId: 8453,
      });
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted");
      toast.success(success);
      await stakerQuery.refetch();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setBusyAction(null);
      setConfirmingUnstake(null);
    }
  };

  const addTokenId = () => {
    const trimmed = customId.trim();
    if (!/^[1-9][0-9]*$/.test(trimmed)) return;
    if (!tokenIds.includes(trimmed)) {
      setAddedIds((prev) => [...prev, trimmed]);
    }
    setCustomId("");
  };

  return (
    <Card className="border-indigo-100 bg-white shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Award className="size-5 text-indigo-600" />
            <CardTitle className="text-xl text-gray-900">
              Uniswap V3 LP Staking Rewards &amp; Accrued Fees
            </CardTitle>
            <Badge className="border-indigo-200 bg-indigo-50 text-indigo-800">
              MRWD program · {stakerQuery.isSuccess ? quarter(stakerQuery.data.mainIndex) : "…"} ·
              contract data
            </Badge>
          </div>
          {stakerQuery.isSuccess && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void stakerQuery.refetch()}
              disabled={stakerQuery.isFetching}
            >
              <RefreshCw
                className={`mr-1.5 size-3.5 ${stakerQuery.isFetching ? "animate-spin" : ""}`}
              />
              Refresh Block #{stakerQuery.data.blockNumber}
            </Button>
          )}
        </div>
        <CardDescription className="[overflow-wrap:anywhere]">
          Live on-chain rewards from <code>UniswapV3Staker</code> ({STAKER}) and uncollected LP swap
          fees from <code>NonfungiblePositionManager</code> ({NPM}).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {stakerQuery.isPending ? (
          <p className="text-slate-500">Reading UniswapV3Staker positions on Base Mainnet…</p>
        ) : stakerQuery.isError ? (
          <p className="text-rose-600" role="alert">
            Could not load V3 Staker positions: {(stakerQuery.error as Error).message}
          </p>
        ) : (
          <>
            {/* Summary Banner */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
                <p className="text-xs font-medium text-indigo-800">
                  Total Accrued Staking Rewards (Claimable)
                </p>
                <p className="mt-1 font-mono text-base font-bold text-indigo-950">
                  {fmtMrwd(stakerQuery.data.totalAccruedMrwd)} MRWD
                </p>
                <p className="mt-0.5 text-[11px] text-indigo-700">
                  Across {stakerQuery.data.rows.filter((r) => r.isStaked).length} staked NFTs
                </p>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3.5">
                <p className="text-xs font-medium text-emerald-800">
                  Total Uncollected LP Trading Fees
                </p>
                <p className="mt-1 font-mono text-base font-bold text-emerald-950">
                  {fmtWeth(stakerQuery.data.totalFeeWeth)}
                </p>
                <p className="mt-0.5 text-[11px] text-emerald-700">
                  Pool Tick: {stakerQuery.data.currentTick} (0.30% tier)
                </p>
              </div>

              <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3.5">
                <p className="text-xs font-medium text-purple-800">
                  {quarter(stakerQuery.data.mainIndex)} Remaining Reserve
                </p>
                <p className="mt-1 font-mono text-base font-bold text-purple-950">
                  {fmtMrwd(stakerQuery.data.unclaimedPoolMrwd)} MRWD
                </p>
                <p className="mt-0.5 text-[11px] text-purple-700">
                  {stakerQuery.data.activeStakesCount} total active stakes in pool
                </p>
              </div>
            </div>

            <RolloverNotice
              data={stakerQuery.data}
              address={address}
              busy={busyAction}
              onMove={(movable) =>
                void runStakerCalls(
                  "move-all",
                  moveCalls(
                    movable.map((r) => ({ tokenId: BigInt(r.tokenId), from: r.stakedKey })),
                    stakerQuery.data.incentiveKey,
                    address!
                  ),
                  `${movable.length} position(s) now earning in ${quarter(stakerQuery.data.mainIndex)}.`,
                  movable.map((r) => r.tokenId)
                )
              }
            />

            {stakerQuery.data.bankedRewards > 0n && address && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs">
                <span className="text-indigo-900">
                  Ready to claim:{" "}
                  <strong className="font-mono">
                    {fmtMrwd(stakerQuery.data.bankedRewards)} MRWD
                  </strong>
                </span>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyAction !== null}
                  onClick={() =>
                    void runStakerCalls(
                      "banked",
                      claimBankedCalls(address),
                      "MRWD claimed to your wallet."
                    )
                  }
                >
                  {busyAction === "banked" ? "Claiming..." : "Claim to Wallet"}
                </Button>
              </div>
            )}

            {portfolio.data?.incomplete && (
              <p role="status" className="text-xs font-semibold text-amber-800">
                Some position reads failed, so this list may be incomplete.
              </p>
            )}
            {stakerQuery.data.missingIds.length > 0 && (
              <p role="status" className="text-xs font-semibold text-amber-800">
                No position found for #{stakerQuery.data.missingIds.join(", #")}.
              </p>
            )}

            {/* Positions Table */}
            {stakerQuery.data.rows.length === 0 ? (
              <p className="rounded-xl border border-slate-200 p-4 text-slate-600">
                {!address
                  ? "Connect a wallet to load your positions, or add a position ID below."
                  : portfolio.isPending || portfolio.isFetching
                    ? "Finding your positions…"
                    : portfolio.isError
                      ? "Could not load your positions. Refresh, or add a position ID below."
                      : "This wallet has no positions in this pool."}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr className="border-b border-slate-200">
                      <th className="px-3 py-2.5 font-semibold">Token ID</th>
                      <th className="px-3 py-2.5 font-semibold">Custody</th>
                      <th className="px-3 py-2.5 font-semibold">Range (Ticks)</th>
                      <th className="px-3 py-2.5 font-semibold">Range Status</th>
                      <th className="px-3 py-2.5 text-right font-semibold">
                        Accrued MRWD (Claimable)
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold">
                        Uncollected WETH Fees
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stakerQuery.data.rows.map((row) => (
                      <tr key={row.tokenId} className="hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono font-bold text-indigo-700">
                          <a
                            href={`https://basescan.org/nft/${NPM}/${row.tokenId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            #{row.tokenId} <ExternalLink className="size-3" />
                          </a>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                          {row.custodyLabel}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-slate-600">
                          [{row.tickLower}, {row.tickUpper}]
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {row.inRange ? (
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                              In Range
                            </Badge>
                          ) : (
                            <Badge className="border-amber-200 bg-amber-50 text-amber-800">
                              Out of Range
                            </Badge>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono font-semibold text-slate-900">
                          {row.isStaked
                            ? `${fmtMrwd(row.accruedMrwd)} MRWD`
                            : row.parkedInPrior
                              ? `${fmtMrwd(row.accruedMrwd)} MRWD (ended)`
                              : "— (Not Staked)"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-slate-800">
                          {fmtWeth(row.feeWeth)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {address && sameAddress(row.depositOwner, address) ? (
                            <div className="flex justify-end gap-1.5">
                              {stakerQuery.data.canStake && !row.isStaked && row.inStaker && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={busyAction !== null}
                                  onClick={() =>
                                    void runStakerCalls(
                                      `move-${row.tokenId}`,
                                      moveCalls(
                                        [{ tokenId: BigInt(row.tokenId), from: row.stakedKey }],
                                        stakerQuery.data.incentiveKey,
                                        address
                                      ),
                                      `#${row.tokenId} is earning in ${quarter(stakerQuery.data.mainIndex)}.`,
                                      [row.tokenId]
                                    )
                                  }
                                >
                                  {busyAction === `move-${row.tokenId}`
                                    ? "Moving..."
                                    : `Stake in ${quarter(stakerQuery.data.mainIndex)}`}
                                </Button>
                              )}
                              {row.isStaked && (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={busyAction !== null || row.accruedMrwd === 0n}
                                  onClick={() =>
                                    void runStakerCalls(
                                      `claim-${row.tokenId}`,
                                      claimCalls(
                                        stakerQuery.data.incentiveKey,
                                        BigInt(row.tokenId),
                                        address,
                                        BigInt(Math.floor(Date.now() / 1000))
                                      ),
                                      `MRWD claimed from #${row.tokenId}.`,
                                      [row.tokenId]
                                    )
                                  }
                                >
                                  {busyAction === `claim-${row.tokenId}` ? "Claiming..." : "Claim"}
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                disabled={busyAction !== null}
                                onClick={() => {
                                  if (confirmingUnstake !== row.tokenId) {
                                    setConfirmingUnstake(row.tokenId);
                                    return;
                                  }
                                  void runStakerCalls(
                                    `unstake-${row.tokenId}`,
                                    unstakeCalls(
                                      row.stakedKey ?? stakerQuery.data.incentiveKey,
                                      BigInt(row.tokenId),
                                      address,
                                      row.stakedKey !== null
                                    ),
                                    `#${row.tokenId} unstaked and returned to your wallet.`,
                                    [row.tokenId]
                                  );
                                }}
                              >
                                {busyAction === `unstake-${row.tokenId}`
                                  ? "Unstaking..."
                                  : confirmingUnstake === row.tokenId
                                    ? "Confirm: stops earning"
                                    : "Unstake"}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                    <tr>
                      <td colSpan={4} className="px-3 py-2.5">
                        Total
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-indigo-900">
                        {fmtMrwd(stakerQuery.data.totalAccruedMrwd)} MRWD
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-emerald-900">
                        {fmtWeth(stakerQuery.data.totalFeeWeth)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Inspect Additional Position ID */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Input
                  value={customId}
                  onChange={(e) => setCustomId(e.currentTarget.value)}
                  placeholder="Inspect V3 NFT Token ID (e.g. 6383553)"
                  className="h-8 w-full font-mono text-xs sm:w-64"
                />
                <Button type="button" size="sm" variant="outline" onClick={addTokenId}>
                  <Plus className="mr-1 size-3.5" /> Add Position
                </Button>
              </div>
              <p className="font-mono text-[11px] text-slate-500">
                Incentive ID: {stakerQuery.data.incentiveId.slice(0, 18)}…
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface RolloverRow {
  tokenId: string;
  isStaked: boolean;
  inStaker: boolean;
  depositOwner: Address;
  stakedKey: StakerIncentiveKey | null;
}

/**
 * When a quarter is running and some of the wallet's deposited positions are not staked in it
 * (parked in the quarter that ended, or unstaked by a finalize), offers to move them all in one
 * transaction. Between quarters it says when staking reopens.
 */
function RolloverNotice({
  data,
  address,
  busy,
  onMove,
}: {
  data: {
    rows: RolloverRow[];
    mainIndex: number;
    mainEnd: bigint;
    canStake: boolean;
    upcoming: { index: number; startTime: bigint; status: number } | undefined;
  };
  address: Address | undefined;
  busy: string | null;
  onMove: (rows: RolloverRow[]) => void;
}) {
  if (!data.canStake) {
    const next = data.upcoming;
    return (
      <p role="status" className="text-xs font-semibold text-amber-800">
        {quarter(data.mainIndex)} ended {fmtDate(data.mainEnd)}.{" "}
        {next
          ? `${quarter(next.index)} starts ${fmtDate(next.startTime)}${
              next.status === 1 ? "" : " and has not been created yet"
            }; staking reopens then.`
          : "No further quarters are scheduled."}
      </p>
    );
  }
  const movable = address
    ? data.rows.filter((r) => !r.isStaked && r.inStaker && sameAddress(r.depositOwner, address))
    : [];
  if (movable.length === 0) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs"
    >
      <span className="text-amber-900">
        {movable.length} position{movable.length === 1 ? " is" : "s are"} not earning{" "}
        {quarter(data.mainIndex)} rewards. Moving claims any reward they hold and stakes them, in
        one transaction.
      </span>
      <Button type="button" size="sm" disabled={busy !== null} onClick={() => onMove(movable)}>
        {busy === "move-all" ? "Moving..." : `Move all to ${quarter(data.mainIndex)}`}
      </Button>
    </div>
  );
}
