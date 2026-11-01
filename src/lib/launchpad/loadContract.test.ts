import { type Hex, keccak256 } from "viem";
import { describe, expect, it } from "vitest";

import { LAUNCHPAD_ARTIFACTS } from "./artifacts";
import { CANONICAL_BASE_CONTRACTS as BASE } from "./constants";
import APPROVED_VERSIONS from "./contract-versions.json";
import {
  type ContractLoader,
  type ContractVersion,
  LoadContractError,
  loadManagedContract,
  maskedCodeHash,
} from "./loadContract";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TARGET = "0x1111111111111111111111111111111111111111";
const TOKEN = "0x2222222222222222222222222222222222222222";

/** Code with one 32-byte stored value at byte 2, like a deployed contract. */
const codeWith = (stored: string, prefix = "aabb"): Hex =>
  `0x${prefix}${stored.slice(2).toLowerCase().padStart(64, "0")}ccdd`;

const version = (kind: string, prefix: string, immutables = [2]): ContractVersion => ({
  kind,
  build: "test",
  creationHash: "0x00",
  codeHash: maskedCodeHash(codeWith(TOKEN, prefix), immutables),
  immutables,
});
const VERSIONS = [
  version("aave-vault", "aa01"),
  version("compound-vault", "aa02"),
  version("staking", "aa03"),
  version("router", "aa04"),
];

interface Setup {
  code?: Hex | undefined;
  admin?: string;
  asset?: string;
}

function setup({ code, admin = OWNER, asset = BASE.USDC }: Setup) {
  const reads: string[] = [];
  const client = {
    getCode: () => Promise.resolve(code),
    readContract: ({ functionName }: { functionName: string }) => {
      reads.push(functionName);
      const values: Record<string, string> = {
        admin,
        token: TOKEN,
        symbol: "VLT",
        underlyingAsset: asset,
      };
      return Promise.resolve(values[functionName]);
    },
  } as unknown as ContractLoader;
  return { client, reads };
}

const load = (options: Setup) =>
  loadManagedContract(setup(options).client, TARGET, OWNER, VERSIONS);

describe("loadManagedContract", () => {
  it("loads each kind of contract, whatever value a deployment stored", async () => {
    const stored = "0x3333333333333333333333333333333333333333";
    await expect(load({ code: codeWith(stored, "aa01") })).resolves.toEqual({
      kind: "vault",
      address: TARGET,
      label: "Aave v3 vault",
    });
    await expect(load({ code: codeWith(stored, "aa02") })).resolves.toMatchObject({
      label: "Compound v3 vault",
    });
    await expect(load({ code: codeWith(stored, "aa03") })).resolves.toEqual({
      kind: "staking",
      address: TARGET,
      tokenSymbol: "VLT",
    });
    await expect(load({ code: codeWith(stored, "aa04") })).resolves.toEqual({
      kind: "router",
      address: TARGET,
    });
  });

  it("refuses a wallet that is not the admin", async () => {
    await expect(load({ code: codeWith(TOKEN, "aa01"), admin: OTHER })).rejects.toThrow(
      "isn't this contract's admin"
    );
  });

  it("matches admin addresses whatever their casing", async () => {
    await expect(
      load({ code: codeWith(TOKEN, "aa01"), admin: OWNER.toLowerCase() })
    ).resolves.toBeTruthy();
  });

  it("reads nothing from code that matches no approved build, so a spoof gets no hearing", async () => {
    const { client, reads } = setup({ code: codeWith(TOKEN, "ffff") });
    await expect(loadManagedContract(client, TARGET, OWNER, VERSIONS)).rejects.toThrow(
      "older version that isn't compatible"
    );
    expect(reads).toEqual([]);
  });

  it("refuses a genuine vault build that holds something other than USDC", async () => {
    await expect(load({ code: codeWith(TOKEN, "aa01"), asset: TOKEN })).rejects.toBeInstanceOf(
      LoadContractError
    );
  });

  it("refuses an address with no contract", async () => {
    await expect(load({ code: "0x" })).rejects.toThrow("No contract was found");
    await expect(load({ code: undefined })).rejects.toThrow("No contract was found");
  });

  it("lets an RPC failure surface as a failed read, not a verdict", async () => {
    const client = {
      getCode: () => Promise.reject(new Error("rpc down")),
    } as unknown as ContractLoader;
    const error = await loadManagedContract(client, TARGET, OWNER).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(LoadContractError);
  });
});

describe("approved contract versions", () => {
  const approved = (name: keyof typeof LAUNCHPAD_ARTIFACTS) =>
    APPROVED_VERSIONS.some(
      (version) => version.creationHash === keccak256(LAUNCHPAD_ARTIFACTS[name].bytecode)
    );

  // If this fails after rebuilding contracts, run scripts/record-contract-version.mjs.
  it("includes the build this app deploys today", () => {
    expect(approved("FeeDiscountStaking")).toBe(true);
    expect(approved("YieldStakingVault")).toBe(true);
    expect(approved("CompoundYieldVault")).toBe(true);
    expect(approved("AtomicFlashArbitrageRouter")).toBe(true);
  });

  it("covers every kind the panels support, and nothing else", () => {
    expect([...new Set(APPROVED_VERSIONS.map((version) => version.kind))].sort()).toEqual([
      "aave-vault",
      "compound-vault",
      "router",
      "staking",
    ]);
  });
});
