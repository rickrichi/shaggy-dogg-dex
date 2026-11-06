import { useState } from "react";

import { toast } from "sonner";
import { type Address, formatEther, parseEther, parseEventLogs } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  erc20Abi,
  GAS_RESERVE,
  type LiquidityPlan,
  mintCall,
  MRWD_POOL,
  planLiquidity,
  POOL_FEE,
  POSITION_MANAGER,
  positionManagerAbi,
  QUOTER_V2,
  quoterAbi,
  stakeNewPositionCall,
  swapCall,
  WETH,
} from "@/lib/mrwd-liquidity";
import { MRWD } from "@/lib/mrwd-pro";

import type { StakerIncentiveKey } from "@/lib/mrwd-staker";

const slot0Abi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const fmtEth = (wei: bigint) => Number(formatEther(wei)).toFixed(6);

/**
 * Reads the amount field leniently: text pasted from elsewhere often carries spaces, a unit, a
 * comma decimal separator or invisible characters, which parseEther rejects outright.
 */
export function parseEthAmount(text: string): bigint {
  const cleaned = text
    .replace(/eth/gi, "")
    .replace(/,/g, ".")
    .replace(/[^0-9.]/g, "");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) {
    throw new Error("Enter the ETH amount as a number, for example 0.004.");
  }
  const [whole = "0", fraction = ""] = cleaned.split(".");
  return parseEther(`${whole || "0"}.${fraction.slice(0, 18) || "0"}`);
}
const fmtB = (wei: bigint) =>
  `${(Number(formatEther(wei)) / 1e9).toLocaleString("en-US", { maximumFractionDigits: 3 })}B`;

const STEPS = ["Swap ETH → MRWD", "Approve MRWD", "Add liquidity", "Stake position"] as const;

/**
 * Adds ETH to the MRWD rewards program as a new full-range position, staked in the running
 * quarter. Four wallet confirmations; each step re-reads chain state, and a stop at any step
 * leaves the funds in the wallet.
 */
export function MrwdAddLiquidity({
  incentiveKey,
  onDone,
}: {
  incentiveKey: StakerIncentiveKey;
  onDone: () => void;
}) {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: 8453 });
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("");
  const [plan, setPlan] = useState<(LiquidityPlan & { mrwdHeld: bigint; ethIn: bigint }) | null>(
    null
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState(-1);

  if (!address || !client) return null;
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);
  const sqrtPrice = async () =>
    (await client.readContract({ address: MRWD_POOL, abi: slot0Abi, functionName: "slot0" }))[0];
  const mrwdBalance = () =>
    client.readContract({
      address: MRWD,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });

  const fillMax = async () => {
    const eth = await client.getBalance({ address });
    setAmount(eth > GAS_RESERVE ? formatEther(eth - GAS_RESERVE) : "0");
    setPlan(null);
  };

  const preview = async () => {
    setBusy("preview");
    try {
      const ethIn = parseEthAmount(amount);
      const eth = await client.getBalance({ address });
      if (ethIn + GAS_RESERVE > eth) {
        throw new Error(
          `Keep ${formatEther(GAS_RESERVE)} ETH for gas; you have ${formatEther(eth)}.`
        );
      }
      const [held, sqrt] = await Promise.all([mrwdBalance(), sqrtPrice()]);
      const p = await planLiquidity(ethIn, held, sqrt, async (amountIn) => {
        const { result } = await client.simulateContract({
          address: QUOTER_V2,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn: WETH, tokenOut: MRWD, amountIn, fee: POOL_FEE, sqrtPriceLimitX96: 0n }],
        });
        return { amountOut: result[0], sqrtPriceX96After: result[1] };
      });
      setPlan({ ...p, mrwdHeld: held, ethIn });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not preview");
    } finally {
      setBusy(null);
    }
  };

  // The builders return typed viem calls; they differ per contract, so they meet here untyped.
  const send = async (call: object) => {
    const request = call as Record<string, unknown>;
    await client.simulateContract({ ...request, account: address } as never);
    const hash = await writeContractAsync({ ...request, chainId: 8453 } as never);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
    return receipt;
  };

  const run = async () => {
    if (!plan) return;
    if (chainId !== 8453) {
      toast.error("Please switch to Base Mainnet.");
      return;
    }
    setBusy("run");
    try {
      if (plan.swapEth > 0n) {
        setStep(0);
        await send(swapCall(plan.swapEth, plan.swapMrwd, address, deadline()));
      }
      // Pair what the wallet holds now, not what was quoted.
      const mrwd = await mrwdBalance();
      setStep(1);
      const allowance = await client.readContract({
        address: MRWD,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, POSITION_MANAGER],
      });
      if (allowance < mrwd) {
        await send({
          address: MRWD,
          abi: erc20Abi,
          functionName: "approve",
          args: [POSITION_MANAGER, mrwd],
        });
      }
      setStep(2);
      const eth = await client.getBalance({ address });
      const lpEth = plan.ethIn - plan.swapEth;
      if (lpEth + GAS_RESERVE / 2n > eth) throw new Error("Not enough ETH left to add liquidity.");
      const mintReceipt = await send(mintCall(await sqrtPrice(), lpEth, mrwd, address, deadline()));
      const minted = parseEventLogs({
        abi: positionManagerAbi,
        eventName: "Transfer",
        logs: mintReceipt.logs,
      }).find(
        (log) =>
          log.address.toLowerCase() === POSITION_MANAGER.toLowerCase() &&
          log.args.from === "0x0000000000000000000000000000000000000000" &&
          log.args.to.toLowerCase() === address.toLowerCase()
      );
      if (!minted) throw new Error("Minted, but could not find the new position ID.");
      const tokenId = minted.args.tokenId;
      setStep(3);
      await send(stakeNewPositionCall(address as Address, tokenId, incentiveKey));
      setStep(4);
      toast.success(`Position #${tokenId} added and staked.`);
      setPlan(null);
      setAmount("");
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(
        `${err instanceof Error ? err.message : "Transaction failed"}. Anything not yet added is still in your wallet.`
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5 text-xs">
      <p className="font-semibold text-indigo-900">Add ETH liquidity &amp; stake</p>
      <p className="text-slate-600">
        Swaps part of the ETH for MRWD, adds both (plus MRWD already in your wallet) as a full-range
        position, and stakes it in the running quarter. Keeps {formatEther(GAS_RESERVE)} ETH for
        gas.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={amount}
          onChange={(e) => {
            setAmount(e.currentTarget.value);
            setPlan(null);
          }}
          placeholder="ETH amount"
          inputMode="decimal"
          className="h-8 w-40 font-mono text-xs"
          disabled={busy !== null}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void fillMax()}
          disabled={busy !== null}
        >
          Max
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void preview()}
          disabled={busy !== null || !amount}
        >
          {busy === "preview" ? "Quoting..." : "Preview"}
        </Button>
      </div>
      {plan && (
        <div className="space-y-2">
          <ul className="space-y-0.5 font-mono text-slate-800">
            <li>
              1. Swap {fmtEth(plan.swapEth)} ETH → ~{fmtB(plan.swapMrwd)} MRWD (min 2% less)
            </li>
            <li>
              2. Add {fmtEth(plan.ethIn - plan.swapEth)} ETH + ~{fmtB(plan.lpMrwd)} MRWD (includes{" "}
              {fmtB(plan.mrwdHeld)} from your wallet)
            </li>
            <li>3. Stake the new position</li>
          </ul>
          <Button type="button" size="sm" onClick={() => void run()} disabled={busy !== null}>
            {busy === "run"
              ? `${STEPS[step] ?? "Working"}...`
              : "Add & stake (up to 4 confirmations)"}
          </Button>
        </div>
      )}
    </div>
  );
}
