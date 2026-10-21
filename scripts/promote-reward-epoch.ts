// scripts/promote-reward-epoch.ts
// After the owner's publishEpoch transaction is final, copies the epoch's manifest and ledger
// into public/rewards/ so the app can offer claims. Refuses unless the chain matches the files.
//   npx tsx scripts/promote-reward-epoch.ts --epoch 1 [--config config/reward-deployment.json] [--rpc <url>] [--out reports/rewards]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createPublicClient, getAddress, http } from "viem";
import { base, baseSepolia } from "viem/chains";

import { parseRewardManifest, REWARD_ABI, type RewardDeployment } from "../src/lib/rewards";

import { hashLedger } from "./lib/reward-merkle";

function arg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function fail(message: string): never {
  throw new Error(message);
}

async function main() {
  const epochArg = arg("--epoch");
  if (!epochArg || !/^[1-9][0-9]*$/.test(epochArg)) fail("--epoch <positive integer> is required.");
  const config = JSON.parse(readFileSync(arg("--config") ?? "config/reward-deployment.json", "utf8")) as RewardDeployment;
  if (!config.distributor) fail("Distributor is not configured.");
  const sourceDir = join(arg("--out") ?? "reports/rewards", `epoch-${epochArg}`);
  const manifestPath = join(sourceDir, "manifest.json");
  const ledgerPath = join(sourceDir, "ledger.json");
  if (!existsSync(manifestPath) || !existsSync(ledgerPath)) fail(`Missing ${manifestPath} or ${ledgerPath}.`);

  const manifest = parseRewardManifest(JSON.parse(readFileSync(manifestPath, "utf8")), config);
  if (manifest.epochId !== epochArg) fail("Manifest epoch does not match --epoch.");
  if (hashLedger(readFileSync(ledgerPath, "utf8")).toLowerCase() !== manifest.ledgerHash.toLowerCase()) {
    fail("ledger.json does not hash to the manifest's ledgerHash.");
  }

  const chain = config.chainId === base.id ? base : baseSepolia;
  const client = createPublicClient({ chain, transport: http(arg("--rpc") ?? chain.rpcUrls.default.http[0]) });
  const epoch = await client.readContract({
    address: getAddress(config.distributor),
    abi: REWARD_ABI,
    functionName: "epochs",
    args: [BigInt(manifest.epochId)],
    blockTag: "finalized",
  });
  if (
    epoch[0].toLowerCase() !== manifest.root.toLowerCase() ||
    epoch[1].toLowerCase() !== manifest.ledgerHash.toLowerCase() ||
    epoch[2] !== BigInt(manifest.allocation)
  ) {
    fail("The finalized on-chain epoch does not match this manifest. Has publishEpoch been sent and finalized?");
  }

  mkdirSync("public/rewards/ledgers", { recursive: true });
  copyFileSync(ledgerPath, `public/rewards/ledgers/${manifest.epochId}.json`);
  if (BigInt(manifest.allocation) === 0n) {
    console.log(`Epoch ${manifest.epochId} has no allocation; published its ledger only (no claims to list).`);
    return;
  }
  mkdirSync("public/rewards/epochs", { recursive: true });
  copyFileSync(manifestPath, `public/rewards/epochs/${manifest.epochId}.json`);

  const indexPath = "public/rewards/index.json";
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as { version: 1; epochs: Array<{ epochId: string; path: string }> };
  const epochs = index.epochs.filter((e) => e.epochId !== manifest.epochId);
  epochs.push({ epochId: manifest.epochId, path: `/rewards/epochs/${manifest.epochId}.json` });
  epochs.sort((a, b) => (BigInt(a.epochId) < BigInt(b.epochId) ? -1 : 1));
  writeFileSync(indexPath, `${JSON.stringify({ version: 1, epochs }, null, 2)}\n`, "utf8");
  console.log(`Epoch ${manifest.epochId} promoted: ${manifest.claims.length} claims, ${manifest.allocation} USDC base units. Commit and deploy public/rewards/.`);
}

main().catch((error: unknown) => {
  console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
