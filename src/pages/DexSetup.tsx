import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { encodeDeployData, formatEther, isAddress, keccak256, zeroAddress } from "viem";
import { base } from "viem/chains";
import { useAccount, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import artifacts from "@/config/dex/artifacts.json";
import {
  DEX_STORAGE_KEY,
  DEX_WETH,
  loadDexDeployment,
  parseDeployment,
} from "@/config/dex/deployment";
import {
  DEX_FACTORY_ABI,
  DEX_ROUTER_METADATA_ABI,
  verifyDexDeployment,
} from "@/lib/amm/own-dex";

import type { Abi, Address, Hash, Hex } from "viem";

const DRAFT_KEY = "shaggy-dex-base-draft-v1";
function savedDraft(): { factory?: string; router?: string; hash?: Hash } {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}");
    if (!value || typeof value !== "object") return {};
    const draft = value as Record<string, unknown>;
    return {
      ...(typeof draft.factory === "string" ? { factory: draft.factory } : {}),
      ...(typeof draft.router === "string" ? { router: draft.router } : {}),
      ...(typeof draft.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(draft.hash)
        ? { hash: draft.hash as Hash }
        : {}),
    };
  } catch {
    return {};
  }
}

export default function DexSetup() {
  const { address, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const client = usePublicClient({ chainId: base.id });
  const { switchChain } = useSwitchChain();
  const [factory, setFactory] = useState(
    () => loadDexDeployment()?.factory ?? savedDraft().factory ?? ""
  );
  const [router, setRouter] = useState(
    () => loadDexDeployment()?.router ?? savedDraft().router ?? ""
  );
  const [admin, setAdmin] = useState<Address | "">("");
  const [feeRecipient, setFeeRecipient] = useState<Address | "">("");
  const [currentFeeTo, setCurrentFeeTo] = useState<Address | null>(null);
  const [currentFeeSetter, setCurrentFeeSetter] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [hash, setHash] = useState<Hash | undefined>(() => savedDraft().hash);
  const [estimate, setEstimate] = useState<{ key: string; gas: bigint; fee: bigint }>();
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!admin && address) setAdmin(address);
    if (!feeRecipient && address) setFeeRecipient(address);
  }, [address, admin, feeRecipient]);
  useEffect(() => {
    if (!client || !isAddress(factory)) {
      setCurrentFeeTo(null);
      setCurrentFeeSetter(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      client.readContract({
        address: factory,
        abi: DEX_FACTORY_ABI,
        functionName: "feeTo",
      }),
      client.readContract({
        address: factory,
        abi: DEX_FACTORY_ABI,
        functionName: "feeToSetter",
      }),
    ])
      .then(([feeToAddr, setterAddr]) => {
        if (!cancelled) {
          setCurrentFeeTo(feeToAddr);
          setCurrentFeeSetter(setterAddr);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentFeeTo(null);
          setCurrentFeeSetter(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, factory]);
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ factory, router, hash }));
  }, [factory, router, hash]);
  const keyFor = (kind: "factory" | "router") =>
    `${kind}:${kind === "factory" ? admin : factory}:${address}`;
  const dataFor = (kind: "factory" | "router") => {
    const argument = kind === "factory" ? admin : factory;
    if (!isAddress(argument) || argument === zeroAddress)
      throw new Error("Enter a valid nonzero address.");
    return encodeDeployData({
      abi: artifacts[kind].abi as Abi,
      bytecode: artifacts[kind].bytecode as Hex,
      args: kind === "factory" ? [argument] : [argument, DEX_WETH],
    });
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const estimateDeployment = (kind: "factory" | "router") =>
    run(async () => {
      if (!client || !address) throw new Error("Connect a wallet first.");
      if (kind === "router") {
        if (!isAddress(factory)) throw new Error("Deploy or enter a factory first.");
        const code = await client.getCode({ address: factory });
        if (!code || keccak256(code) !== keccak256(artifacts.factory.runtime as Hex))
          throw new Error("Factory bytecode does not match the pinned artifact.");
      }
      const gas = await client.estimateGas({ account: address, data: dataFor(kind) });
      const gasPrice = await client.getGasPrice();
      setEstimate({ key: keyFor(kind), gas, fee: gas * gasPrice });
      setMessage(
        `Estimated ${kind} deployment: ${gas.toString()} execution gas. Review the full fee in your wallet.`
      );
    });
  const deploy = (kind: "factory" | "router") =>
    run(async () => {
      if (
        !wallet ||
        !client ||
        !address ||
        chainId !== base.id ||
        (await wallet.getChainId()) !== base.id ||
        (await wallet.getAddresses())[0]?.toLowerCase() !== address.toLowerCase()
      )
        throw new Error("Connect your wallet on Base mainnet.");
      if (estimate?.key !== keyFor(kind)) throw new Error("Estimate this deployment first.");
      // No private keys are loaded by the app. Every deployment is a wallet transaction.
      const tx = await wallet.sendTransaction({
        account: address,
        chain: base,
        data: dataFor(kind),
      });
      setHash(tx);
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ factory, router, hash: tx, kind }));
      setMessage(
        "Deployment submitted. Waiting for confirmation. Keep the transaction hash if you close this page."
      );
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success" || !receipt.contractAddress)
        throw new Error("Deployment reverted; check the receipt.");
      if (kind === "factory") setFactory(receipt.contractAddress);
      else setRouter(receipt.contractAddress);
      setEstimate(undefined);
      setActive(false);
      setMessage(
        `${kind === "factory" ? "Factory" : "Router"} deployed at ${receipt.contractAddress}.`
      );
    });
  const activate = () =>
    run(async () => {
      const deployment = parseDeployment({ factory, router });
      if (!deployment || !client) throw new Error("Enter both deployed addresses.");
      await verifyDexDeployment(client, deployment);
      const pinned = parseDeployment({
        factory: import.meta.env.VITE_SHAGGY_FACTORY_ADDRESS,
        router: import.meta.env.VITE_SHAGGY_ROUTER_ADDRESS,
      });
      if (
        pinned &&
        (pinned.factory.toLowerCase() !== factory.toLowerCase() ||
          pinned.router.toLowerCase() !== router.toLowerCase())
      )
        throw new Error(
          "This site has a pinned deployment. Update its build environment to change those addresses."
        );
      localStorage.setItem(DEX_STORAGE_KEY, JSON.stringify(deployment));
      setActive(true);
      setMessage("Deployment verified and selected for this browser. Open Swap to use your pools.");
    });
  const recover = () =>
    run(async () => {
      if (!client || !hash || !/^0x[0-9a-fA-F]{64}$/.test(hash))
        throw new Error("Enter a valid Base deployment transaction hash.");
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt.status !== "success" || !receipt.contractAddress)
        throw new Error("This transaction is not a successful contract deployment.");
      const code = await client.getCode({ address: receipt.contractAddress });
      if (code && keccak256(code) === keccak256(artifacts.factory.runtime as Hex))
        setFactory(receipt.contractAddress);
      else {
        const linkedFactory = await client.readContract({
          address: receipt.contractAddress,
          abi: DEX_ROUTER_METADATA_ABI,
          functionName: "factory",
        });
        await verifyDexDeployment(client, {
          factory: linkedFactory,
          router: receipt.contractAddress,
        });
        setFactory(linkedFactory);
        setRouter(receipt.contractAddress);
      }
      setEstimate(undefined);
      setActive(false);
      setMessage(
        "Deployment recovered from its confirmed Base receipt. Verify and activate below."
      );
    });
  const setProtocolFeeTo = (target: Address) =>
    run(async () => {
      if (
        !wallet ||
        !client ||
        !address ||
        chainId !== base.id ||
        (await wallet.getChainId()) !== base.id ||
        (await wallet.getAddresses())[0]?.toLowerCase() !== address.toLowerCase()
      )
        throw new Error("Connect your wallet on Base mainnet.");
      if (!isAddress(factory)) throw new Error("Enter a valid deployed factory address first.");
      if (!isAddress(target)) throw new Error("Enter a valid fee recipient address.");
      const { request } = await client.simulateContract({
        account: address,
        address: factory,
        abi: DEX_FACTORY_ABI,
        functionName: "setFeeTo",
        args: [target],
      });
      const tx = await wallet.writeContract({ ...request, chain: base });
      setHash(tx);
      setMessage("Submitting setFeeTo transaction on Base...");
      const receipt = await client.waitForTransactionReceipt({ hash: tx });
      if (receipt.status !== "success") throw new Error("setFeeTo transaction reverted.");
      setCurrentFeeTo(target);
      setMessage(
        target === zeroAddress
          ? "Protocol fee collection disabled (feeTo = 0x0)."
          : `Protocol fee collection enabled! Recipient set to ${target}.`
      );
    });
  const exportConfig = () => {
    const file = new Blob(
      [
        `# Shaggy-Dogg-Dex · Base mainnet (8453)\nVITE_SHAGGY_FACTORY_ADDRESS=${factory}\nVITE_SHAGGY_ROUTER_ADDRESS=${router}\n`,
      ],
      { type: "text/plain" }
    );
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "shaggy-base-deployment.env";
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="mx-auto max-w-3xl space-y-5 py-6">
      <h1 className="text-3xl font-bold text-purple-900">Launch Shaggy-Dogg-Dex on Base</h1>
      <p className="text-slate-600">
        Deploy an independent V2 factory and Router02. Users own their LP tokens and approve swaps
        from their wallets. A new deployment starts with empty pools.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Deployment terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Network: Base mainnet (8453). Two deployment transactions, paid in ETH. Initial
            liquidity is a separate deposit of your chosen token amounts.
          </p>
          <p>
            Swap fee: 0.30%. Protocol fee collection starts disabled. The factory fee administrator
            can set the protocol fee recipient or transfer its own role.
          </p>
          <p>
            Contracts use unchanged, pinned Uniswap V2 bytecode. LP tokens retain the upstream name.
            This integration has local tests; it has not received an independent security audit.
          </p>
          <p>
            Wrapped ETH: <code>{DEX_WETH}</code>
          </p>
          {chainId !== base.id && (
            <Button onClick={() => switchChain({ chainId: base.id })}>Switch wallet to Base</Button>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>1. Deploy factory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            Factory fee administrator (wallet or multisig)
            <Input
              value={admin}
              disabled={busy}
              onChange={(e) => {
                setAdmin(e.target.value as Address);
                setEstimate(undefined);
              }}
            />
          </label>
          <div className="flex gap-2">
            <Button
              disabled={busy || !address}
              variant="outline"
              onClick={() => void estimateDeployment("factory")}
            >
              Estimate factory gas
            </Button>
            <Button
              disabled={busy || chainId !== base.id || estimate?.key !== keyFor("factory")}
              onClick={() => void deploy("factory")}
            >
              Deploy factory — wallet approval
            </Button>
          </div>
          <label className="block text-sm">
            Deployed factory address
            <Input
              value={factory}
              disabled={busy}
              onChange={(e) => {
                setFactory(e.target.value);
                setActive(false);
                setEstimate(undefined);
              }}
            />
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>2. Deploy router</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">Router02 will use the factory above and canonical Base WETH.</p>
          <div className="flex gap-2">
            <Button
              disabled={busy || !address || !factory}
              variant="outline"
              onClick={() => void estimateDeployment("router")}
            >
              Estimate router gas
            </Button>
            <Button
              disabled={busy || chainId !== base.id || estimate?.key !== keyFor("router")}
              onClick={() => void deploy("router")}
            >
              Deploy router — wallet approval
            </Button>
          </div>
          <label className="block text-sm">
            Deployed router address
            <Input
              value={router}
              disabled={busy}
              onChange={(e) => {
                setRouter(e.target.value);
                setActive(false);
              }}
            />
          </label>
        </CardContent>
      </Card>
      {estimate && (
        <p className="text-sm">
          Execution fee estimate: {formatEther(estimate.fee)} ETH. Base data fees and fee changes
          are reflected in the wallet’s final estimate.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>3. Verify and open your DEX</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Checks deployed bytecode, network, factory linkage and WETH. You can also enter an
            existing deployment above.
          </p>
          <Button disabled={busy || !factory || !router} onClick={() => void activate()}>
            Verify and use these contracts
          </Button>
          {active && (
            <div className="flex flex-wrap gap-3">
              <a className="text-purple-700 underline" href="/swap">
                Open Swap
              </a>
              <a className="text-purple-700 underline" href="/liquidity">
                Seed your first pool
              </a>
              <Button variant="outline" onClick={exportConfig}>
                Download public configuration
              </Button>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Browser selection is local. Set the exported VITE_SHAGGY addresses in the site’s build
            environment and rebuild to publish the same deployment to all visitors.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>4. Protocol fee collection (setFeeTo)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Enable or update the V2 factory protocol fee recipient (<code>feeTo</code>) so the
            protocol collects 1/6th of the 0.30% swap fee (0.05%) as LP shares when liquidity is
            minted or burned. Only the factory <code>feeToSetter</code> can call this.
          </p>
          {currentFeeTo && (
            <p className="text-xs text-slate-600">
              Current <code>feeTo</code>:{" "}
              <strong>
                {currentFeeTo === zeroAddress ? "Disabled (0x0)" : currentFeeTo}
              </strong>
              {currentFeeSetter ? ` · feeToSetter: ${currentFeeSetter}` : ""}
            </p>
          )}
          <label className="block text-sm">
            Protocol fee recipient address (<code>feeTo</code>)
            <Input
              disabled={busy}
              value={feeRecipient}
              onChange={(e) => setFeeRecipient(e.target.value as Address)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={
                busy ||
                chainId !== base.id ||
                !isAddress(factory) ||
                !isAddress(feeRecipient) ||
                feeRecipient === zeroAddress
              }
              onClick={() => void setProtocolFeeTo(feeRecipient as Address)}
            >
              Enable protocol fee collection
            </Button>
            {currentFeeTo && currentFeeTo !== zeroAddress && (
              <Button
                variant="outline"
                disabled={busy || chainId !== base.id || !isAddress(factory)}
                onClick={() => void setProtocolFeeTo(zeroAddress)}
              >
                Disable protocol fee
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recover a submitted deployment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm">
            Base transaction hash
            <Input
              disabled={busy}
              value={hash ?? ""}
              onChange={(e) => setHash(e.target.value as Hash)}
            />
          </label>
          <Button disabled={busy || !hash} variant="outline" onClick={() => void recover()}>
            Load confirmed deployment
          </Button>
          <p className="text-xs">
            If a confirmation timed out or this page closed, recover the original transaction before
            deploying again.
          </p>
        </CardContent>
      </Card>
      {message && (
        <p role="status" className="break-words rounded border bg-white p-3 text-sm">
          {message}
        </p>
      )}
      {hash && (
        <a
          className="block text-purple-700 underline"
          href={`https://basescan.org/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
        >
          Deployment receipt: {hash}
        </a>
      )}
      <Link className="text-purple-700 underline" to="/swap">
        Back to DEX
      </Link>
    </div>
  );
}
