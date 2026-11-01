import { describe, expect, it } from "vitest";

import { MRWD_PRO_STAKING } from "@/lib/mrwd-pro";

import {
  discoverStakedPortfolio,
  discoverV3Positions,
  knownStakingSources,
  type PositionReader,
  stakedSideOf,
} from "./staked-positions";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const STAKER = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";
const TIMELOCK = "0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25";
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const MRWD = "0xC17227AAa33C54634B6cE7AD0bf33A156563c179";
const OTHER_TOKEN = "0x1234567890123456789012345678901234567890";
const VAULT = "0x8531807ef36560cd7db230c95db85791aa586dda";

interface Chain {
  held: Record<string, bigint[]>;
  owners: Record<string, string>;
  pairs: Record<string, [string, string]>;
  balances?: Record<string, bigint>;
  assets?: Record<string, string>;
  failing?: string[];
  beneficiary?: string;
}

interface Call {
  address: string;
  functionName: string;
  args?: readonly unknown[];
}

function reader(chain: Chain): PositionReader {
  const answer = ({ address, functionName, args }: Call) => {
    if (chain.failing?.includes(functionName)) throw new Error("rpc failed");
    if (functionName === "tokenOfOwnerByIndex") {
      return chain.held[args![0] as string]![Number(args![1])];
    }
    if (functionName === "deposits") return [chain.owners[String(args![0])], 1, 0, 0];
    if (functionName === "getLock") return [chain.owners[String(args![0])], 1n, 1n, true];
    if (functionName === "positions") {
      const [token0, token1] = chain.pairs[String(args![0])]!;
      return [0n, OTHER, token0, token1, 3000, -60, 60, 1000n];
    }
    if (["stakedBalance", "stakedOf", "sharesOf"].includes(functionName)) {
      return chain.balances?.[address.toLowerCase()] ?? 0n;
    }
    if (functionName === "token" || functionName === "underlyingAsset") {
      if (!chain.assets?.[address.toLowerCase()]) throw new Error("no such function");
      return chain.assets[address.toLowerCase()];
    }
    if (functionName === "beneficiary") return chain.beneficiary ?? OTHER;
    if (functionName === "getPool") return "0x0000000000000000000000000000000000000B01";
    if (functionName === "symbol") return "NEW";
    if (functionName === "name") return "New Token";
    if (functionName === "decimals") return 18;
    throw new Error(`unexpected ${functionName}`);
  };
  return {
    readContract: ((call: Call) =>
      Promise.resolve(BigInt(chain.held[call.args![0] as string]?.length ?? 0))) as never,
    multicall: (({ contracts }: { contracts: Call[] }) =>
      Promise.resolve(
        contracts.map((contract) => {
          try {
            return { status: "success" as const, result: answer(contract) };
          } catch {
            return { status: "failure" as const };
          }
        })
      )) as never,
  };
}

describe("discoverV3Positions", () => {
  const chain: Chain = {
    held: { [OWNER]: [7n], [STAKER]: [1n, 2n, 3n], [TIMELOCK]: [4n, 5n] },
    owners: { 1: OWNER, 2: OTHER, 3: OWNER.toLowerCase(), 4: OWNER, 5: OTHER },
    pairs: Object.fromEntries(["1", "2", "3", "4", "5", "7"].map((id) => [id, [WETH, MRWD]])),
  };

  it("finds only this owner's positions in every custody, without event logs", async () => {
    const { positions, incomplete } = await discoverV3Positions(reader(chain), OWNER);
    expect(positions.map((p) => [p.tokenId, p.custody])).toEqual([
      ["7", "wallet"],
      ["1", "staker"],
      ["3", "staker"],
      ["4", "timelock"],
    ]);
    expect(incomplete).toBe(false);
  });

  it("returns what the panels show: symbols, decimals, pool, range and liquidity", async () => {
    const { positions } = await discoverV3Positions(reader(chain), OWNER);
    expect(positions[0]).toMatchObject({
      token0Symbol: "WETH",
      token1Symbol: "MRWD",
      token0Decimals: 18,
      pool: "0x0000000000000000000000000000000000000B01",
      tickLower: -60,
      tickUpper: 60,
      liquidity: "1000",
    });
  });

  it("finds a different wallet's positions the same way", async () => {
    const { positions } = await discoverV3Positions(reader(chain), OTHER);
    expect(positions.map((p) => p.tokenId)).toEqual(["2", "5"]);
  });

  it("reports a failed read rather than claiming the list is complete", async () => {
    const { incomplete, positions } = await discoverV3Positions(
      reader({ ...chain, failing: ["deposits"] }),
      OWNER
    );
    expect(incomplete).toBe(true);
    expect(positions.map((p) => p.custody)).not.toContain("staker");
  });
});

describe("discoverStakedPortfolio", () => {
  const empty = { held: {}, owners: {}, pairs: {} };

  it("lists a token staked as an LP position even with nothing in the wallet", async () => {
    const result = await discoverStakedPortfolio(
      reader({
        held: { [STAKER]: [1n, 2n] },
        owners: { 1: OWNER, 2: OWNER },
        pairs: { 1: [WETH, MRWD], 2: [WETH, MRWD] },
      }),
      OWNER,
      []
    );
    expect(result.tokens).toEqual([
      expect.objectContaining({ address: MRWD, sources: ["LP staked ×2"] }),
    ]);
  });

  it("is not specific to MRWD: any token in any staked pool is listed", async () => {
    const result = await discoverStakedPortfolio(
      reader({
        held: { [STAKER]: [1n] },
        owners: { 1: OWNER },
        pairs: { 1: [OTHER_TOKEN, USDC] },
      }),
      OWNER,
      []
    );
    expect(result.tokens).toEqual([
      expect.objectContaining({ address: OTHER_TOKEN, symbol: "NEW", sources: ["LP staked"] }),
    ]);
  });

  it("does not list a position that only sits in the wallet as staked", async () => {
    const result = await discoverStakedPortfolio(
      reader({ held: { [OWNER]: [1n] }, owners: {}, pairs: { 1: [WETH, MRWD] } }),
      OWNER,
      []
    );
    expect(result.positions).toHaveLength(1);
    expect(result.tokens).toEqual([]);
  });

  it("lists single-sided stakes and vault shares, and skips empty ones", async () => {
    const staking = "0x0000000000000000000000000000000000000A01";
    const idle = "0x0000000000000000000000000000000000000A02";
    const result = await discoverStakedPortfolio(
      reader({
        ...empty,
        balances: { [staking.toLowerCase()]: 5n, [VAULT]: 9n },
        assets: { [staking.toLowerCase()]: OTHER_TOKEN, [VAULT]: USDC },
      }),
      OWNER,
      [
        { address: staking, kind: "staking" },
        { address: idle, kind: "staking" },
        { address: VAULT, kind: "vault" },
      ]
    );
    expect(result.tokens.map((t) => [t.address, t.sources])).toEqual([
      [OTHER_TOKEN, ["Staking"]],
      [USDC, ["Vault"]],
    ]);
    expect(result.incomplete).toBe(false);
  });

  it("shows EQX as vesting for its beneficiary, and only for them", async () => {
    const vesting = await discoverStakedPortfolio(reader({ ...empty, beneficiary: OWNER }), OWNER, []);
    expect(vesting.tokens).toEqual([expect.objectContaining({ symbol: "EQX", sources: ["Vesting"] })]);
    const other = await discoverStakedPortfolio(reader(empty), OWNER, []);
    expect(other.tokens).toEqual([]);
  });

  it("flags the list when the vesting read fails", async () => {
    const result = await discoverStakedPortfolio(
      reader({ ...empty, failing: ["beneficiary"] }),
      OWNER,
      []
    );
    expect(result.incomplete).toBe(true);
  });

  it("maps pro staking to MRWD, which it does not expose through token()", async () => {
    const result = await discoverStakedPortfolio(
      reader({ ...empty, balances: { [MRWD_PRO_STAKING.toLowerCase()]: 5n } }),
      OWNER,
      [{ address: MRWD_PRO_STAKING, kind: "pro-staking" }]
    );
    expect(result.tokens).toEqual([
      expect.objectContaining({ address: MRWD, sources: ["Pro staking"] }),
    ]);
  });
});

describe("knownStakingSources", () => {
  it("adds a launch's staking and vaults once each", () => {
    const stakingAddress = "0x0000000000000000000000000000000000000A01";
    const sources = knownStakingSources([
      { stakingAddress, vaultAddress: VAULT },
      { stakingAddress },
    ]);
    expect(sources.filter((s) => s.address === stakingAddress)).toHaveLength(1);
    expect(sources.filter((s) => s.address === VAULT)).toHaveLength(1);
  });
});

describe("stakedSideOf", () => {
  it("prefers the project token and falls back to WETH for a quote pair", () => {
    expect(stakedSideOf({ token0: WETH, token1: MRWD })).toBe(MRWD);
    expect(stakedSideOf({ token0: MRWD, token1: USDC })).toBe(MRWD);
    expect(stakedSideOf({ token0: USDC, token1: WETH })).toBe(WETH);
  });
});
