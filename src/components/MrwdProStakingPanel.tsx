import { useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { erc20Abi, formatUnits, type Hash, parseUnits, zeroAddress } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { positiveAmount } from "@/lib/amm/own-dex";
import {
  MRWD,
  MRWD_PRO_STAKING,
  PRO_STAKE,
  PRO_STORE_URL,
  proLockedThrough,
  proStakingAbi,
} from "@/lib/mrwd-pro";

type Action = "stake" | "relock" | "withdraw";

const whole = (units: bigint) =>
  Number(formatUnits(units, 18)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (seconds: bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString("en-US", { dateStyle: "medium" });

export function MrwdProStakingPanel() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: 8453 });
  const { data: wallet } = useWalletClient();
  const [amount, setAmount] = useState("1000000000");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const scope = useRef({ address, chainId });
  scope.current = { address, chainId };
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<Hash>();
  const info = useQuery({
    queryKey: ["mrwd-pro", address],
    enabled: !!client,
    refetchInterval: 30_000,
    queryFn: async () => {
      const who = address ?? zeroAddress;
      const [balance, deposits, matured, block] = await Promise.all([
        client!.readContract({
          address: MRWD,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [who],
        }),
        client!.readContract({
          address: MRWD_PRO_STAKING,
          abi: proStakingAbi,
          functionName: "depositsOf",
          args: [who],
        }),
        client!.readContract({
          address: MRWD_PRO_STAKING,
          abi: proStakingAbi,
          functionName: "maturedOf",
          args: [who],
        }),
        client!.getBlock(),
      ]);
      const now = block.timestamp;
      const staked = deposits.reduce((sum, d) => sum + d.amount, 0n);
      return {
        balance,
        deposits,
        matured,
        staked,
        now,
        proThrough: proLockedThrough(deposits, PRO_STAKE, now),
      };
    },
  });

  const run = async (action: Action) => {
    if (lock.current || !client || !wallet || !address || chainId !== 8453) return;
    lock.current = true;
    setBusy(true);
    setHash(undefined);
    const assertWallet = async () => {
      if (
        scope.current.address !== address ||
        scope.current.chainId !== 8453 ||
        (await wallet.getChainId()) !== 8453 ||
        (await wallet.getAddresses())[0]?.toLowerCase() !== address.toLowerCase()
      )
        throw new Error("Reconnect this wallet on Base.");
    };
    const send = async (request: Parameters<typeof wallet.writeContract>[0], label: string) => {
      await assertWallet();
      setMessage(`Confirm ${label} in your wallet.`);
      const tx = await wallet.writeContract({ ...request, chain: base });
      setHash(tx);
      setMessage("Waiting for Base confirmation.");
      if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success")
        throw new Error(`${label} reverted.`);
    };
    try {
      await assertWallet();
      if (action === "stake") {
        if (!positiveAmount(amount, 18)) throw new Error("Enter a positive MRWD amount.");
        const value = parseUnits(amount, 18);
        const allowance = await client.readContract({
          address: MRWD,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, MRWD_PRO_STAKING],
        });
        if (allowance < value) {
          const { request } = await client.simulateContract({
            address: MRWD,
            abi: erc20Abi,
            functionName: "approve",
            args: [MRWD_PRO_STAKING, value],
            account: address,
          });
          await send(request, "the MRWD approval");
        }
        const { request } = await client.simulateContract({
          address: MRWD_PRO_STAKING,
          abi: proStakingAbi,
          functionName: "stake",
          args: [value],
          account: address,
        });
        await send(request, "the stake");
        setMessage("Staked. Your MRWD is locked for 30 days.");
      } else {
        const { request } = await client.simulateContract({
          address: MRWD_PRO_STAKING,
          abi: proStakingAbi,
          functionName: action === "relock" ? "relockAll" : "withdrawMatured",
          account: address,
        });
        await send(request, action === "relock" ? "the relock" : "the withdrawal");
        setMessage(
          action === "relock"
            ? "Every deposit is locked for another 30 days."
            : "Matured MRWD withdrawn."
        );
      }
      await info.refetch();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message.split("\n")[0]! : "Staking request failed."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const ready = !busy && !!address && chainId === 8453 && info.isSuccess;
  return (
    <Card className="border-purple-100 shadow-sm">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl text-gray-900">
          Stake MRWD for Equilnyxs Pro
          <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">Live on Base</Badge>
        </CardTitle>
        <CardDescription>
          Keep {whole(PRO_STAKE)} MRWD staked to get Equilnyxs Pro. Each stake is locked for 30 days
          and then always withdrawable; staking pays no yield and has no exit fee. Swapping and
          basic features never need MRWD.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!address ? (
          <p>Connect a wallet on Base to stake.</p>
        ) : info.isPending ? (
          <p>Reading your stake…</p>
        ) : info.isError ? (
          <p role="alert">Staking data unavailable.</p>
        ) : (
          <>
            <p>
              Wallet: {whole(info.data.balance)} MRWD · Staked: {whole(info.data.staked)} MRWD ·
              Withdrawable now: {whole(info.data.matured)} MRWD
            </p>
            {info.data.proThrough ? (
              <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">
                Your stake qualifies for Pro through {day(info.data.proThrough)}.{" "}
                <a
                  className="font-semibold underline"
                  href={PRO_STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get your Pro key ↗
                </a>
              </p>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-slate-600">
                Not enough MRWD locked for Pro yet ({whole(PRO_STAKE)} needed).
              </p>
            )}
            {info.data.deposits.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-600">
                {info.data.deposits.map((d, i) => (
                  <li key={`${d.unlockAt}-${i}`}>
                    {whole(d.amount)} MRWD{" "}
                    {d.unlockAt > info.data.now ? `locked until ${day(d.unlockAt)}` : "unlocked"}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <label className="block">
          MRWD to stake
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready} onClick={() => void run("stake")}>
            Approve and stake
          </Button>
          <Button
            variant="outline"
            disabled={!ready || !info.data || info.data.deposits.length === 0}
            onClick={() => void run("relock")}
          >
            Relock all for 30 days
          </Button>
          <Button
            variant="outline"
            disabled={!ready || !info.data || info.data.matured === 0n}
            onClick={() => void run("withdraw")}
          >
            Withdraw unlocked
          </Button>
        </div>
        {message && <p role="status">{message}</p>}
        {hash && (
          <a
            className="underline"
            href={`https://basescan.org/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
        )}
        <a
          className="block text-xs underline"
          href={`https://basescan.org/address/${MRWD_PRO_STAKING}`}
          target="_blank"
          rel="noreferrer"
        >
          Pro staking contract
        </a>
      </CardContent>
    </Card>
  );
}
