import { VaultDeploymentPanel } from "@/components/VaultDeploymentPanel";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { base } from "viem/chains";
import {
  erc20Abi,
  formatUnits,
  isAddress,
  parseAbi,
  parseUnits,
  zeroAddress,
  type Address,
  type Hash,
} from "viem";
import { BASE_STAKING } from "@/lib/staking";
import { positiveAmount } from "@/lib/amm/own-dex";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const abi = parseAbi([
  "function underlyingAsset() view returns (address)",
  "function aavePool() view returns (address)",
  "function discountStaking() view returns (address)",
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function sharesOf(address) view returns (uint256)",
  "function performanceFeeBps() view returns (uint16)",
  "function discountDenominator() view returns (uint256)",
  "function deposit(uint256) returns (uint256)",
  "function withdraw(uint256) returns (uint256)",
]);
const configured = import.meta.env.VITE_YIELD_VAULT_ADDRESS as string | undefined;
const vault: Address =
  configured && isAddress(configured) ? configured : "0x16a1E9c10B913912b7B7df4649D9596D95ce33E6";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export function YieldVaultPanel() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: 8453 });
  const { data: wallet } = useWalletClient();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const scope = useRef({ address, chainId });
  scope.current = { address, chainId };
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<Hash>();
  const info = useQuery({
    queryKey: ["yield-vault", vault, address],
    enabled: !!client,
    refetchInterval: 30_000,
    queryFn: async () => {
      const contract = { address: vault, abi };
      const [asset, pool, staking, assets, shares, userShares, fee] = await client!.multicall({
        allowFailure: false,
        contracts: [
          { ...contract, functionName: "underlyingAsset" },
          { ...contract, functionName: "aavePool" },
          { ...contract, functionName: "discountStaking" },
          { ...contract, functionName: "totalAssets" },
          { ...contract, functionName: "totalShares" },
          { ...contract, functionName: "sharesOf", args: [address ?? zeroAddress] },
          { ...contract, functionName: "performanceFeeBps" },
        ],
      });
      const denominator = await client!
        .readContract({ ...contract, functionName: "discountDenominator" })
        .catch(() => 0n);
      return {
        assets,
        shares,
        userShares,
        fee,
        corrected: denominator === 10_000n,
        configured:
          asset.toLowerCase() === usdc.toLowerCase() &&
          pool.toLowerCase() === "0xa238dd80c259a72e81d7e4664a9801593f98d1c5" &&
          staking.toLowerCase() === BASE_STAKING.stakingAddress.toLowerCase(),
      };
    },
  });
  const execute = async (withdraw: boolean) => {
    if (
      lock.current ||
      !client ||
      !wallet ||
      !address ||
      chainId !== 8453 ||
      !info.data?.configured ||
      info.isError
    )
      return;
    if (!withdraw && (!info.data.corrected || !configured || !isAddress(configured))) return;
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
    try {
      await assertWallet();
      const value = withdraw
        ? await client.readContract({
            address: vault,
            abi,
            functionName: "sharesOf",
            args: [address],
          })
        : positiveAmount(amount, 6)
          ? parseUnits(amount, 6)
          : 0n;
      if (value <= 0n) throw new Error("Enter a positive amount or load an existing position.");
      if (!withdraw) {
        const allowance = await client.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, vault],
        });
        if (allowance < value) {
          const { request } = await client.simulateContract({
            address: usdc,
            abi: erc20Abi,
            functionName: "approve",
            args: [vault, value],
            account: address,
          });
          await assertWallet();
          setMessage("Confirm USDC approval in your wallet.");
          const approval = await wallet.writeContract({ ...request, chain: base });
          setHash(approval);
          if ((await client.waitForTransactionReceipt({ hash: approval })).status !== "success")
            throw new Error("Approval reverted.");
        }
      }
      const { request } = await client.simulateContract({
        address: vault,
        abi,
        functionName: withdraw ? "withdraw" : "deposit",
        args: [value],
        account: address,
      });
      await assertWallet();
      setMessage("Confirm the vault transaction in your wallet.");
      const tx = await wallet.writeContract({ ...request, chain: base });
      setHash(tx);
      setMessage("Waiting for Base confirmation.");
      if ((await client.waitForTransactionReceipt({ hash: tx })).status !== "success")
        throw new Error("Vault transaction reverted.");
      setMessage("Vault transaction confirmed.");
      await info.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Vault request failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>USDC yield vault · Base</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <a
          className="underline"
          href={`https://basescan.org/address/${vault}`}
          target="_blank"
          rel="noreferrer"
        >
          View vault contract
        </a>
        {info.isPending ? (
          <p>Reading vault…</p>
        ) : info.isError ? (
          <p role="alert">Vault data unavailable.</p>
        ) : (
          <>
            <p>
              Assets: {formatUnits(info.data.assets, 6)} USDC · Your shares:{" "}
              {info.data.userShares.toString()} · Performance fee: {info.data.fee / 100}% of yield
              before staking discount.
            </p>
            {(!info.data.corrected || !configured) && (
              <p>
                New deposits are disabled until a corrected vault is deployed and configured. The
                existing vault uses an incompatible discount scale. Existing positions can still be
                withdrawn.
              </p>
            )}
            {!info.data.configured && (
              <p role="alert">Vault asset, pool, or staking contract does not match this app.</p>
            )}
            <label className="block">
              Deposit USDC
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
            </label>
            <Button
              disabled={
                busy ||
                !address ||
                chainId !== 8453 ||
                !info.data.configured ||
                !info.data.corrected ||
                !configured
              }
              onClick={() => void execute(false)}
            >
              Approve and deposit
            </Button>
            <Button
              variant="outline"
              disabled={
                busy ||
                !address ||
                chainId !== 8453 ||
                !info.data.configured ||
                info.data.userShares === 0n
              }
              onClick={() => void execute(true)}
            >
              Withdraw all shares
            </Button>
          </>
        )}
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
        <p>
          Yield depends on Aave utilization. This vault does not distribute flash-arbitrage profits
          or confer voting rights.
        </p>
        <VaultDeploymentPanel />
      </CardContent>
    </Card>
  );
}
