import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Award, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { type Address, formatUnits, parseAbi } from "viem";
import { useAccount, usePublicClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MRWD } from "@/lib/mrwd-pro";

const SCHEDULER: Address = "0xCAbf284806b800d9A771B55857B9fCF735ea7109";
const STAKER: Address = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";
const NPM: Address = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const POOL: Address = "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5";
const TIMELOCK: Address = "0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25";
const DEFAULT_TOKEN_IDS = [
  "6383553",
  "6383541",
  "6383531",
  "6367926",
  "6351512",
];
const MAX_UINT128 = (1n << 128n) - 1n;

const schedulerAbi = parseAbi([
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

const fmtMrwd = (wei: bigint) =>
  Number(formatUnits(wei, 18)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });

const fmtWeth = (wei: bigint) =>
  wei === 0n ? "0 WETH" : `${Number(formatUnits(wei, 18)).toFixed(12)} WETH`;

export function MrwdLpStakerPanel() {
  const { address } = useAccount();
  const client = usePublicClient({ chainId: 8453 });
  const [tokenIds, setTokenIds] = useState<string[]>(DEFAULT_TOKEN_IDS);
  const [customId, setCustomId] = useState("");

  const stakerQuery = useQuery({
    queryKey: ["mrwd-v3-staker-positions", tokenIds.join(","), address],
    enabled: !!client && tokenIds.length > 0,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [block, key, incId, slot0] = await Promise.all([
        client!.getBlock(),
        client!.readContract({
          address: SCHEDULER,
          abi: schedulerAbi,
          functionName: "incentiveKey",
          args: [0n],
        }),
        client!.readContract({
          address: SCHEDULER,
          abi: schedulerAbi,
          functionName: "incentiveId",
          args: [0n],
        }),
        client!.readContract({
          address: POOL,
          abi: poolAbi,
          functionName: "slot0",
        }),
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
      const rows = await Promise.all(
        tokenIds.map(async (idStr) => {
          const tid = BigInt(idStr);
          const [nftHolder, pos, deposit, stake] = await Promise.all([
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
          ]);

          let accruedMrwd = 0n;
          const isStaked = stake[1] > 0n;
          if (isStaked) {
            try {
              const rewardInfo = await client!.readContract({
                address: STAKER,
                abi: stakerAbi,
                functionName: "getRewardInfo",
                args: [key, tid],
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
            accruedMrwd,
            feeWeth,
            feeMrwd,
          };
        }),
      );

      const totalAccruedMrwd = rows.reduce((sum, r) => sum + r.accruedMrwd, 0n);
      const totalFeeWeth = rows.reduce((sum, r) => sum + r.feeWeth, 0n);

      return {
        blockNumber: block.number.toString(),
        currentTick,
        incentiveId: incId,
        unclaimedPoolMrwd: incState[0],
        activeStakesCount: Number(incState[2]),
        bankedRewards,
        rows,
        totalAccruedMrwd,
        totalFeeWeth,
      };
    },
  });

  const addTokenId = () => {
    const trimmed = customId.trim();
    if (!/^[1-9][0-9]*$/.test(trimmed)) return;
    if (!tokenIds.includes(trimmed)) {
      setTokenIds((prev) => [...prev, trimmed]);
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
              Quarter 1 program · contract data
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
        <CardDescription>
          Live on-chain rewards from <code>UniswapV3Staker</code> ({STAKER}) and
          uncollected LP swap fees from <code>NonfungiblePositionManager</code>{" "}
          ({NPM}).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {stakerQuery.isPending ? (
          <p className="text-slate-500">
            Reading UniswapV3Staker positions on Base Mainnet…
          </p>
        ) : stakerQuery.isError ? (
          <p className="text-rose-600" role="alert">
            Could not load V3 Staker positions:{" "}
            {(stakerQuery.error as Error).message}
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
                  Across{" "}
                  {stakerQuery.data.rows.filter((r) => r.isStaked).length}{" "}
                  staked NFTs
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
                  Quarter 1 Remaining Reserve
                </p>
                <p className="mt-1 font-mono text-base font-bold text-purple-950">
                  {fmtMrwd(stakerQuery.data.unclaimedPoolMrwd)} MRWD
                </p>
                <p className="mt-0.5 text-[11px] text-purple-700">
                  {stakerQuery.data.activeStakesCount} total active stakes in
                  pool
                </p>
              </div>
            </div>

            {/* Positions Table */}
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
                          : "— (Not Staked)"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono text-slate-800">
                        {fmtWeth(row.feeWeth)}
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
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Inspect Additional Position ID */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <Input
                  value={customId}
                  onChange={(e) => setCustomId(e.currentTarget.value)}
                  placeholder="Inspect V3 NFT Token ID (e.g. 6383553)"
                  className="h-8 w-64 font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addTokenId}
                >
                  <Plus className="mr-1 size-3.5" /> Add Position
                </Button>
              </div>
              <p className=" font-mono text-[11px] text-slate-500">
                Incentive ID: {stakerQuery.data.incentiveId.slice(0, 18)}…
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
