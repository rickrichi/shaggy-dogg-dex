import { useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { type Address, getAddress, type Hash, parseAbi } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";

// One-off admin tool: rotate the flash-arbitrage router's operator after the old deployer key leaked.
// Visible only when the connected wallet is the router's admin. Every action is simulated first.
const ROUTER: Address = "0x70315019D12A11556C837970675cDC8Fa54d186b";
const NEW_OPERATOR: Address = "0x739a609509B4BFb949fde82C1E502D10C34bD488";
const OLD_OPERATOR: Address = "0xc1c3d6552231DB22A22Bdf513C0833024FF3f42B";

const abi = parseAbi([
  "function admin() view returns (address)",
  "function isOperator(address) view returns (bool)",
  "function setOperator(address operator, bool approved)",
]);

export function RouterOperatorPanel() {
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { data: wallet } = useWalletClient();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<Hash>();

  const state = useQuery({
    queryKey: ["router-operators"],
    enabled: !!client,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [admin, newOp, oldOp] = await client!.multicall({
        allowFailure: false,
        contracts: [
          { address: ROUTER, abi, functionName: "admin" },
          { address: ROUTER, abi, functionName: "isOperator", args: [NEW_OPERATOR] },
          { address: ROUTER, abi, functionName: "isOperator", args: [OLD_OPERATOR] },
        ],
      });
      return { admin, newOp, oldOp };
    },
  });

  const isAdmin = !!address && !!state.data && getAddress(address) === getAddress(state.data.admin);
  if (!isAdmin || !state.data) return null;

  const run = async (operator: Address, approved: boolean) => {
    if (lock.current || !client || !wallet || !address) return;
    lock.current = true;
    setBusy(true);
    setHash(undefined);
    try {
      if (chainId !== base.id || (await wallet.getChainId()) !== base.id) {
        throw new Error("Switch your wallet to Base.");
      }
      if (getAddress((await wallet.getAddresses())[0]!) !== getAddress(state.data.admin)) {
        throw new Error("The wallet's active account is not the router admin.");
      }
      const { request } = await client.simulateContract({
        address: ROUTER,
        abi,
        functionName: "setOperator",
        args: [operator, approved],
        account: address,
      });
      setMessage(
        "Confirm the transaction in your wallet. Check: contract 0x7031…186b, setOperator."
      );
      const tx = await wallet.writeContract({ ...request, chain: base });
      setHash(tx);
      setMessage("Waiting for Base confirmation.");
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("Transaction reverted.");
      setMessage("Confirmed.");
      await state.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-amber-300 bg-amber-50/70 p-4 text-sm">
      <h3 className="font-semibold">Router operator rotation (admin only)</h3>
      <p>
        Router <code>0x7031…186b</code>. New operator <code>0x739a…D488</code>:{" "}
        <strong>{state.data.newOp ? "approved" : "not approved"}</strong>. Old deployer{" "}
        <code>0xc1c3…F42B</code>:{" "}
        <strong>{state.data.oldOp ? "still an operator" : "revoked"}</strong>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || state.data.newOp} onClick={() => void run(NEW_OPERATOR, true)}>
          1. Approve new operator
        </Button>
        <Button
          variant="outline"
          disabled={busy || !state.data.oldOp}
          onClick={() => void run(OLD_OPERATOR, false)}
        >
          2. Revoke old operator
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
    </section>
  );
}
