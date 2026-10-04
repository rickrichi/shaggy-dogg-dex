// Read-only on-chain inventory of every Shaggy/AMUTT address referenced in the repo.
// Writes deployments/base-mainnet.manifest.json from chain state + Blockscout, never from docs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, http, parseAbi, getAddress, type Address } from "viem";
import { base } from "viem/chains";

const keyFile = "server/data/shaggy-daemon.key";
const url = existsSync(keyFile)
  ? `http://127.0.0.1:8790/v1/base/${readFileSync(keyFile, "utf8").trim()}`
  : "https://mainnet.base.org";
const client = createPublicClient({ chain: base, transport: http(url, { timeout: 15_000 }) });
const labels = JSON.parse(readFileSync("deployments/base-mainnet.labels.json", "utf8")) as Record<string, unknown>;
const candidates = readFileSync(process.argv[2]!, "utf8").split(/\s+/).filter(Boolean).map(a => getAddress(a));
const abi = parseAbi([
  "function name() view returns (string)", "function symbol() view returns (string)",
  "function admin() view returns (address)", "function owner() view returns (address)",
  "function minter() view returns (address)", "function treasury() view returns (address)",
  "function totalSupply() view returns (uint256)", "function token() view returns (address)",
  "function discountDenominator() view returns (uint256)",
]);
const fields = ["name", "symbol", "admin", "owner", "minter", "treasury", "token", "totalSupply", "discountDenominator"] as const;
const out: Record<string, unknown>[] = [];
const eoas: string[] = [];
for (const address of candidates) {
  const code = await client.getCode({ address });
  const row: Record<string, unknown> = { address, hasCode: !!code && code !== "0x" };
  if (row.hasCode) {
    for (const f of fields) {
      try { const v = await client.readContract({ address, abi, functionName: f }); row[f] = typeof v === "bigint" ? v.toString() : v; } catch { /* not implemented */ }
    }
    try {
      const r = await fetch(`https://base.blockscout.com/api/v2/smart-contracts/${address}`, { signal: AbortSignal.timeout(15_000) });
      const d = await r.json() as { is_verified?: boolean; name?: string; source_code?: string };
      row.blockscoutVerified = Boolean(d.is_verified ?? d.source_code);
      row.contractName = d.name ?? null;
      try {
        const a = await (await fetch(`https://base.blockscout.com/api/v2/addresses/${address}`, { signal: AbortSignal.timeout(15_000) })).json() as { creator_address_hash?: string; creation_transaction_hash?: string };
        row.creator = a.creator_address_hash ?? null; row.creationTx = a.creation_transaction_hash ?? null;
      } catch { /* optional */ }
      row.label = labels[address] ?? Object.entries(labels).find(([k]) => k.toLowerCase() === address.toLowerCase())?.[1] ?? null;
    } catch { row.blockscoutVerified = "unknown"; }
  }
  if (row.hasCode) out.push(row); else eoas.push(address);
}
const manifest = { chainId: 8453, generatedAt: new Date().toISOString(), source: "on-chain reads + Blockscout API", contracts: out, adminAddresses: [...new Set(out.flatMap(c => [c.admin, c.owner, c.minter, c.treasury].filter(Boolean) as string[]))], noCodeAddresses: eoas };
writeFileSync("deployments/base-mainnet.manifest.json", JSON.stringify(manifest, null, 2));
for (const r of out) console.log(r.address, r.hasCode ? `${r.contractName ?? "?"} sym=${r.symbol ?? "-"} admin=${r.admin ?? r.owner ?? "-"} verified=${r.blockscoutVerified}` : "NO CODE");
