// src/components/launchpad/LoadContractCard.tsx
import { useEffect, useState } from "react";

import { FileSearch, Loader2 } from "lucide-react";
import { type Address, getAddress, isAddress } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ContractLoader,
  LoadContractError,
  type LoadedContract,
  loadManagedContract,
} from "@/lib/launchpad/loadContract";

import { FlashRouterPanel } from "./FlashRouterPanel";
import { LaunchedVaultPanel } from "./LaunchedVaultPanel";
import { StakingFeesPanel } from "./StakingFeesPanel";

/**
 * Lets a creator manage their contracts from any browser. Loaded contracts live only in this
 * component, so each one is verified on-chain and nothing is trusted from saved browser data.
 */
export function LoadContractCard() {
  const { address: wallet } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [loaded, setLoaded] = useState<LoadedContract[]>([]);

  // Verified for one wallet only, so another wallet starts empty.
  useEffect(() => {
    setLoaded([]);
    setError("");
    setInput("");
  }, [wallet]);

  const load = async () => {
    setError("");
    const pasted = input.trim();
    if (!isAddress(pasted, { strict: false })) {
      setError("Enter a valid Base contract address.");
      return;
    }
    if (!wallet || !client) return;
    const address: Address = getAddress(pasted);
    if (loaded.some((contract) => contract.address === address)) {
      setError("That contract is already loaded.");
      return;
    }
    setChecking(true);
    try {
      const contract = await loadManagedContract(
        client as unknown as ContractLoader,
        address,
        wallet
      );
      setLoaded((current) => [...current, contract]);
      setInput("");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof LoadContractError
          ? err.message
          : "Could not read this contract. Please try again."
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section
      aria-labelledby="load-contract-heading"
      className="space-y-3 rounded-xl border border-indigo-100 bg-white/90 p-4 shadow-sm"
    >
      <div>
        <h2
          id="load-contract-heading"
          className="flex items-center gap-2 text-sm font-bold text-slate-900"
        >
          <FileSearch className="size-4 text-indigo-600" /> Load my contract
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Launched from another browser or device? Paste a staking contract, vault, or arbitrage
          router address. It loads only if it runs an approved launchpad build and your wallet is
          its admin.
        </p>
      </div>
      {wallet ? (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <Input
            aria-label="Contract address"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "load-contract-error" : undefined}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="0x… contract address"
            className="font-mono text-xs"
            disabled={checking}
          />
          <Button
            type="submit"
            disabled={!input.trim() || checking}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {checking && <Loader2 className="mr-2 size-4 animate-spin" />}
            {checking ? "Checking" : "Load"}
          </Button>
        </form>
      ) : (
        <p className="text-xs font-semibold text-slate-600">
          Connect your wallet to load a contract.
        </p>
      )}
      {error && (
        <p id="load-contract-error" role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      {loaded.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {loaded.map((contract) => (
            <div key={contract.address} className="space-y-1">
              <p className="truncate font-mono text-[11px] text-slate-500">{contract.address}</p>
              {contract.kind === "vault" ? (
                <LaunchedVaultPanel vaultAddress={contract.address} label={contract.label} />
              ) : contract.kind === "router" ? (
                <FlashRouterPanel routerAddress={contract.address} />
              ) : (
                <StakingFeesPanel
                  stakingAddress={contract.address}
                  tokenSymbol={contract.tokenSymbol}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
