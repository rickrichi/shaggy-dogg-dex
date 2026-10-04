import { useRef, useState } from "react";

import { type Address, encodeDeployData, formatEther, type Hash, parseAbi } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { LAUNCHPAD_ARTIFACTS } from "@/lib/launchpad/artifacts";
import { BASE_STAKING } from "@/lib/staking";

const legacy = "0x16a1E9c10B913912b7B7df4649D9596D95ce33E6";
const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const pool = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const aToken = "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB";
const deploymentKey = "shaggy-vault-v3-deployment-base";
function savedHash(): Hash | undefined {
  try {
    const value = localStorage.getItem(deploymentKey);
    return value && /^0x[0-9a-fA-F]{64}$/.test(value) ? (value as Hash) : undefined;
  } catch {
    return undefined;
  }
}
const metadata = parseAbi([
  "function admin() view returns (address)",
  "function treasury() view returns (address)",
  "function discountDenominator() view returns (uint256)",
]);

export function VaultDeploymentPanel() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { data: wallet } = useWalletClient();
  const scope = useRef({ address, chainId });
  scope.current = { address, chainId };
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<Hash | undefined>(savedHash);
  const [deployed, setDeployed] = useState<Address>();
  const [review, setReview] = useState<{
    admin: Address;
    treasury: Address;
    gas: bigint;
    fee: bigint;
    at: number;
  }>();
  const artifact = LAUNCHPAD_ARTIFACTS.YieldStakingVault;
  const dataFor = (admin: Address, treasury: Address) =>
    encodeDeployData({
      ...artifact,
      args: [usdc, pool, aToken, BASE_STAKING.stakingAddress, admin, treasury],
    });
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Deployment failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const prepare = () =>
    run(async () => {
      if (!client) throw new Error("Base connection unavailable");
      const [admin, treasury] = await client.multicall({
        allowFailure: false,
        contracts: [
          { address: legacy, abi: metadata, functionName: "admin" },
          { address: legacy, abi: metadata, functionName: "treasury" },
        ],
      });
      const gas = await client.estimateGas({ account: admin, data: dataFor(admin, treasury) });
      setReview({ admin, treasury, gas, fee: gas * (await client.getGasPrice()), at: Date.now() });
    });
  const checkReceipt = async (tx: Hash) => {
    if (!client) throw new Error("Base connection unavailable");
    const receipt = await client.waitForTransactionReceipt({ hash: tx, timeout: 120_000 });
    if (receipt.status !== "success" || !receipt.contractAddress)
      throw new Error(
        "Deployment reverted; inspect the transaction before preparing another deployment."
      );
    const [admin, treasury] = await client.multicall({
      allowFailure: false,
      contracts: [
        { address: legacy, abi: metadata, functionName: "admin" },
        { address: legacy, abi: metadata, functionName: "treasury" },
      ],
    });
    const transaction = await client.getTransaction({ hash: tx });
    if (
      transaction.to ||
      transaction.from.toLowerCase() !== admin.toLowerCase() ||
      transaction.input !== dataFor(admin, treasury)
    )
      throw new Error(
        "Deployment transaction does not match the reviewed vault and administrators"
      );
    const denominator = await client.readContract({
      address: receipt.contractAddress,
      abi: metadata,
      functionName: "discountDenominator",
    });
    if (denominator !== 10_000n) throw new Error("Deployed vault failed version verification");
    setDeployed(receipt.contractAddress);
    setMessage(
      "Deployment verified. Configure this address to enable the new vault; existing positions remain in the legacy vault."
    );
  };
  const deploy = () =>
    run(async () => {
      if (!client || !wallet || !review || !address || chainId !== base.id)
        throw new Error("Connect the current vault administrator on Base mainnet");
      if (Date.now() - review.at > 120_000) throw new Error("Refresh the deployment estimate");
      const assertWallet = async () => {
        const accounts = await wallet.getAddresses();
        if (
          scope.current.address !== address ||
          scope.current.chainId !== base.id ||
          accounts[0]?.toLowerCase() !== review.admin.toLowerCase() ||
          (await wallet.getChainId()) !== base.id
        )
          throw new Error("Wallet must match the reviewed administrator on Base");
      };
      await assertWallet();
      const data = dataFor(review.admin, review.treasury);
      await client.estimateGas({ account: address, data });
      await assertWallet();
      const tx = await wallet.sendTransaction({ account: address, chain: base, data });
      setHash(tx);
      setMessage("Deployment submitted; awaiting receipt. Do not submit again.");
      try {
        localStorage.setItem(deploymentKey, tx);
      } catch {
        /* Hash stays visible even if storage is unavailable. */
      }
      await checkReceipt(tx);
    });
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">Deploy USDC vault v3 (share-price protection)</h3>
      <p className="text-sm text-muted-foreground">
        Base mainnet · Aave USDC · 10% performance fee before staking discounts. Deployment
        preserves the current administrator and treasury. Existing deposits are not moved.
      </p>
      <Button variant="outline" disabled={busy || !!hash} onClick={() => void prepare()}>
        Review deployment estimate
      </Button>
      {review && (
        <div className="space-y-2 break-all text-sm">
          <p>
            Administrator: {review.admin}
            <br />
            Treasury: {review.treasury}
          </p>
          <p>
            Estimated execution fee: {formatEther(review.fee)} ETH. The wallet includes current
            network and L1 data fees.
          </p>
          <Button
            disabled={
              busy ||
              !!hash ||
              chainId !== base.id ||
              address?.toLowerCase() !== review.admin.toLowerCase()
            }
            onClick={() => void deploy()}
          >
            Deploy with connected wallet
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {hash && (
        <a
          className="block text-sm underline"
          href={`https://base.blockscout.com/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View deployment transaction
        </a>
      )}
      {hash && !deployed && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run(() => checkReceipt(hash))}
        >
          Check submitted deployment
        </Button>
      )}
      {deployed && <code className="block break-all">VITE_YIELD_VAULT_ADDRESS={deployed}</code>}
    </section>
  );
}
