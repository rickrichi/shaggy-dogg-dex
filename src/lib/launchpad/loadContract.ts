// src/lib/launchpad/loadContract.ts
import { type Address, type Hex, keccak256, parseAbi } from "viem";

import { CANONICAL_BASE_CONTRACTS as BASE } from "./constants";
import APPROVED_VERSIONS from "./contract-versions.json";

const readAbi = parseAbi([
  "function admin() view returns (address)",
  "function token() view returns (address)",
  "function underlyingAsset() view returns (address)",
  "function symbol() view returns (string)",
]);

export type VersionKind = "staking" | "aave-vault" | "compound-vault" | "router";

/** One approved build, recorded by scripts/record-contract-version.mjs. */
export interface ContractVersion {
  kind: string;
  build: string;
  creationHash: string;
  codeHash: string;
  immutables: number[];
}

export type LoadedContract =
  | { kind: "vault"; address: Address; label: string; market: "aave" | "compound" }
  | { kind: "staking"; address: Address; tokenSymbol: string }
  | { kind: "router"; address: Address };

/** A reason shown to the user. Anything else thrown here is a failed read. */
export class LoadContractError extends Error {}

export interface ContractLoader {
  getCode: (args: { address: Address }) => Promise<Hex | undefined>;
  readContract: (args: never) => Promise<unknown>;
}

const NOT_SUPPORTED =
  "This contract can't be loaded: it isn't from this launchpad, or it's an older version that isn't compatible.";

/** Blanks the values each deployment stores in its code, leaving what every copy shares. */
export function maskedCodeHash(code: Hex, immutables: readonly number[]) {
  let body = code.slice(2);
  for (const start of immutables) {
    body = body.slice(0, start * 2) + "0".repeat(64) + body.slice(start * 2 + 64);
  }
  return keccak256(`0x${body}`);
}

const read = <T>(client: ContractLoader, address: Address, functionName: string) =>
  client.readContract({ address, abi: readAbi, functionName } as never) as Promise<T>;

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * Identifies a pasted contract, and refuses it unless `owner` is verifiably its admin. A contract
 * can report any admin or asset it likes, so nothing it says is read until its code has matched an
 * approved build.
 */
export async function loadManagedContract(
  client: ContractLoader,
  address: Address,
  owner: Address,
  versions: readonly ContractVersion[] = APPROVED_VERSIONS
): Promise<LoadedContract> {
  const code = await client.getCode({ address });
  if (!code || code === "0x") throw new LoadContractError("No contract was found at this address.");

  const match = versions.find(
    (version) => maskedCodeHash(code, version.immutables) === version.codeHash
  );
  if (!match) throw new LoadContractError(NOT_SUPPORTED);

  let loaded: LoadedContract;
  if (match.kind === "staking") {
    const token = await read<Address>(client, address, "token");
    loaded = { kind: "staking", address, tokenSymbol: await read<string>(client, token, "symbol") };
  } else if (match.kind === "router") {
    loaded = { kind: "router", address };
  } else {
    // Masking hides the stored asset, and the vault panels only handle USDC.
    const asset = await read<Address>(client, address, "underlyingAsset");
    if (!sameAddress(asset, BASE.USDC)) throw new LoadContractError(NOT_SUPPORTED);
    const market = match.kind === "aave-vault" ? "aave" : "compound";
    const label = market === "aave" ? "Aave v3 vault" : "Compound v3 vault";
    loaded = { kind: "vault", address, label, market };
  }

  const admin = await read<Address>(client, address, "admin");
  if (!sameAddress(admin, owner)) {
    throw new LoadContractError("The connected wallet isn't this contract's admin.");
  }
  return loaded;
}
