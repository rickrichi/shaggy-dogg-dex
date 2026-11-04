import { decodeFunctionData, encodeFunctionData, type PublicClient, type WalletClient } from "viem";
import { base } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

import { NONFUNGIBLE_POSITION_MANAGER_ABI } from "@/lib/amm/uniswap-v3";

import { LAUNCHPAD_ARTIFACTS } from "./artifacts";
import { AERODROME_ROUTER_ABI, CANONICAL_BASE_CONTRACTS, LAUNCHPAD_ARCHETYPES } from "./constants";
import { executeLaunchpadDeployment } from "./deployEngine";

import type { LaunchpadFormState } from "./types";

const admin = CANONICAL_BASE_CONTRACTS.DeployerAdminWallet;
const form: LaunchpadFormState = {
  tokenName: "Audit",
  tokenSymbol: "AUD",
  decimals: 18,
  initialSupply: "1000000",
  description: "",
  selectedArchetype: "standard_governance",
  performanceFeeBps: 1000,
  stakingLockDays: 7,
  earlyUnstakeFeeBps: 100,
  enableDexSeeding: true,
  selectedDex: "uniswap_v3",
  pairAsset: "ETH",
  initialEthLiquidity: "0.05",
  initialTokenLiquidityPercent: 50,
  executionMode: "metamask",
  recipientAdminAddress: "",
};
const lastSuite = (deploy: ReturnType<typeof vi.fn>) =>
  deploy.mock.calls.at(-1)?.[0].args[0] as
    | { deployAaveVault?: boolean; deployFullSuite?: boolean }
    | undefined;
const SUITE_ADDRESSES: Record<string, string> = {
  staking: "0x0000000000000000000000000000000000000A01",
  aaveVault: "0x0000000000000000000000000000000000000A02",
  compoundVault: "0x0000000000000000000000000000000000000A03",
  arbitrageRouter: "0x0000000000000000000000000000000000000A04",
};
const zero = "0x0000000000000000000000000000000000000000";
function clients(revertWrap = false, launchFee = 0n, usdcBalance = launchFee) {
  const deployContract = vi.fn().mockResolvedValue("0x01");
  const writeContract = vi.fn().mockResolvedValue("0x02");
  const wallet = { getChainId: vi.fn().mockResolvedValue(8453), deployContract, writeContract };
  const publicClient = {
    chain: base,
    // Defaults to 0 so existing tests below never trigger the launch-fee step at all
    // (executeLaunchpadDeployment skips it entirely when feeAmount() reads as 0).
    readContract: vi.fn().mockImplementation(({ functionName }) => {
      if (functionName === "feeAmount") return Promise.resolve(launchFee);
      if (functionName === "balanceOf") return Promise.resolve(usdcBalance);
      return Promise.resolve(
        lastSuite(deployContract)?.deployFullSuite ||
          functionName === "staking" ||
          (functionName === "aaveVault" && lastSuite(deployContract)?.deployAaveVault)
          ? SUITE_ADDRESSES[functionName]
          : zero
      );
    }),
    waitForTransactionReceipt: vi.fn().mockImplementation(({ hash }) =>
      Promise.resolve({
        status: revertWrap && hash === "0x02" ? "reverted" : "success",
        contractAddress: "0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263",
      })
    ),
    simulateContract: vi.fn().mockImplementation((request) => Promise.resolve({ request })),
  };
  const run = (input = form, user: `0x${string}` = admin) =>
    executeLaunchpadDeployment(
      wallet as unknown as WalletClient,
      publicClient as unknown as PublicClient,
      input,
      user
    );
  return { wallet, publicClient, run };
}
describe("V3 launchpad safety", () => {
  it("rejects invalid token identities before reading fees or deploying", async () => {
    const { wallet, publicClient, run } = clients();
    await expect(run({ ...form, tokenName: "" })).rejects.toThrow("Token name is required");
    await expect(run({ ...form, tokenSymbol: "BAD-SYMBOL" })).rejects.toThrow(
      "2–6 uppercase letters or numbers"
    );
    await expect(run({ ...form, initialSupply: "-100" })).rejects.toThrow("positive whole number");
    expect(publicClient.readContract).not.toHaveBeenCalled();
    expect(wallet.deployContract).not.toHaveBeenCalled();
  });

  it("rejects a wrong chain or unsupported decimals before deploying", async () => {
    const { wallet, run } = clients();
    wallet.getChainId.mockResolvedValueOnce(1);
    await expect(run()).rejects.toThrow("Base Mainnet");
    await expect(run({ ...form, decimals: 6 })).rejects.toThrow("18 decimals");
    expect(wallet.deployContract).not.toHaveBeenCalled();
  });
  it("deploys the fixed-supply token template with the whole supply to the recipient", async () => {
    const { wallet, run } = clients();
    await run({ ...form, enableDexSeeding: false });
    const token = wallet.deployContract.mock.calls[0]![0];
    expect(token.bytecode).toBe(LAUNCHPAD_ARTIFACTS.FixedSupplyToken.bytecode);
    expect(token.args).toEqual(["Audit", "AUD", admin, 1_000_000n * 10n ** 18n]);
    const names = LAUNCHPAD_ARTIFACTS.FixedSupplyToken.abi.map((item) =>
      "name" in item ? item.name : item.type
    );
    expect(names).not.toContain("mint");
    expect(names).not.toContain("admin");
  });
  it("refuses a below-minimum seed before deploying anything", async () => {
    const { wallet, run } = clients();
    await expect(run({ ...form, initialEthLiquidity: "0.0005" })).rejects.toThrow(
      "at least 0.05 ETH"
    );
    expect(wallet.deployContract).not.toHaveBeenCalled();
  });
  it("lets any wallet launch, not only the protocol administrator", async () => {
    const { wallet, run } = clients();
    const creator = "0x00000000000000000000000000000000000C0FFE";
    await run({ ...form, enableDexSeeding: false, recipientAdminAddress: "" }, creator);
    expect(wallet.deployContract).toHaveBeenCalledTimes(1);
    expect(wallet.deployContract.mock.calls[0]![0].args[2]).toBe(creator);
    expect(wallet.deployContract.mock.calls[0]![0].account).toBe(creator);
  });
  it("rejects seeding tokens allocated to a different wallet before deployment", async () => {
    const { wallet, run } = clients();
    await expect(
      run({ ...form, recipientAdminAddress: CANONICAL_BASE_CONTRACTS.WETH })
    ).rejects.toThrow("receiving");
    expect(wallet.deployContract).not.toHaveBeenCalled();
  });
  it("reports partial success and stops seeding after a reverted wrap", async () => {
    const { wallet, run, publicClient } = clients(true);
    const result = await run();
    expect(result.tokenAddress).toBeDefined();
    expect(result.liquiditySeedingError).toContain("reverted");
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(publicClient.simulateContract).not.toHaveBeenCalled();
  });
  it("simulates an atomic protected mint and sends it on Base", async () => {
    const { run, publicClient, wallet } = clients();
    const result = await run();
    expect(result.liquiditySeedingError).toBeUndefined();
    const request = publicClient.simulateContract.mock.calls[0]![0];
    expect(request.functionName).toBe("multicall");
    const mint = decodeFunctionData({
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      data: request.args[0][1],
    });
    if (mint.functionName !== "mint") throw new Error("Expected mint");
    expect(mint.args[0].amount0Min).toBeGreaterThan(0n);
    expect(mint.args[0].amount1Min).toBeGreaterThan(0n);
    expect(wallet.writeContract.mock.calls.at(-1)![0].chain.id).toBe(8453);
  });
});

describe("launchpad card settings", () => {
  const signer = "0x00000000000000000000000000000000000C0FFE";
  const noSeed = { ...form, enableDexSeeding: false };
  const config = (wallet: ReturnType<typeof clients>["wallet"]) =>
    wallet.deployContract.mock.calls[1]![0].args[0];

  it("says plainly where the supply goes and what the Aave vault holds", () => {
    const card = (id: string) => LAUNCHPAD_ARCHETYPES.find((a) => a.id === id)!.description;
    expect(card("standard_governance")).toContain("minus any share you seed");
    expect(card("full_defi_suite")).toContain("minus any share you seed");
    expect(card("aave_v3_yield")).toContain("Your token is not deposited");
    const aave = LAUNCHPAD_ARCHETYPES.find((a) => a.id === "aave_v3_yield")!;
    expect(aave.riskContagionModel).toBe("Pooled + Sovereign");
    expect(aave.riskDescription).toContain("cannot raise");
    expect(aave.architectureDetails).toContain("immutable Base USDC");
    const suite = LAUNCHPAD_ARCHETYPES.find((a) => a.id === "full_defi_suite")!;
    expect(suite.riskContagionModel).toBe("Pooled + Sovereign");
    expect(suite.riskDescription).toContain("In both vaults");
    expect(suite.riskDescription).toContain("cannot raise");
    expect(suite.architectureDetails).toContain("USDC Comet");
    expect(suite.description).toContain("lowers the fee in both vaults");
  });

  it("explains that the Lightweight risk label excludes privileged protocol controls", () => {
    const lightweight = LAUNCHPAD_ARCHETYPES.find((a) => a.id === "standard_governance")!;
    expect(lightweight.riskContagionModel).toBe("None");
    expect(lightweight.riskDescription).toContain("No privileged token controls");
    expect(lightweight.riskDescription).toContain("smart-contract risks still apply");
  });

  it("accurately discloses the staking-only economics and sovereign controls", () => {
    const staking = LAUNCHPAD_ARCHETYPES.find((a) => a.id === "staking_rewards")!;
    expect(staking.description).toContain("does not itself apply discounts");
    expect(staking.description).toContain("does not").and.toContain("pay staking rewards");
    expect(staking.riskContagionModel).toBe("Sovereign");
    expect(staking.riskDescription).toContain("change tiers");
    expect(staking.riskDescription).toContain("up to 50%");
    expect(staking.riskDescription).toContain("Existing unlock times cannot be extended");
    expect(staking.riskDescription).toContain("resets the lock");
  });

  it("offers only the four cards whose contracts do what they describe", () => {
    expect(LAUNCHPAD_ARCHETYPES.map((a) => a.id)).toEqual([
      "standard_governance",
      "staking_rewards",
      "aave_v3_yield",
      "full_defi_suite",
    ]);
    expect(JSON.stringify(LAUNCHPAD_ARCHETYPES)).not.toMatch(/Moonwell|Morpho|Silo|Fluid/);
  });

  it("configures staking in one transaction after the token", async () => {
    const { wallet, run } = clients();
    const result = await run({
      ...noSeed,
      selectedArchetype: "staking_rewards",
      stakingLockDays: 30,
      earlyUnstakeFeeBps: 250,
    });
    expect(wallet.deployContract).toHaveBeenCalledTimes(2);
    expect(wallet.writeContract).not.toHaveBeenCalled();
    const suite = wallet.deployContract.mock.calls[1]![0];
    expect(suite.bytecode).toBe(LAUNCHPAD_ARTIFACTS.LaunchpadSuiteDeployer.bytecode);
    const supply = 1_000_000n * 10n ** 18n;
    expect(suite.args[0]).toMatchObject({
      lockSeconds: 2_592_000n,
      unstakeFeeBps: 250,
      deployAaveVault: false,
      deployFullSuite: false,
      tiers: [
        { stakeRequired: supply / 10_000n, discountBps: 1000 },
        { stakeRequired: supply / 1_000n, discountBps: 2500 },
        { stakeRequired: supply / 100n, discountBps: 5000 },
        { stakeRequired: supply / 10n, discountBps: 7500 },
      ],
    });
    expect(result.stakingAddress).toBe(SUITE_ADDRESSES.staking);
    expect(result.vaultAddress).toBeUndefined();
  });

  it("deploys the full suite with one signature and returns every address", async () => {
    const { wallet, run } = clients();
    const result = await run({
      ...noSeed,
      selectedArchetype: "full_defi_suite",
      performanceFeeBps: 1500,
    });
    expect(wallet.deployContract).toHaveBeenCalledTimes(2);
    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(config(wallet)).toMatchObject({ performanceFeeBps: 1500, deployFullSuite: true });
    expect(result.vaultAddress).toBe(SUITE_ADDRESSES.aaveVault);
    expect(result.compoundVaultAddress).toBe(SUITE_ADDRESSES.compoundVault);
    expect(result.borrowerAddress).toBe(SUITE_ADDRESSES.arbitrageRouter);
  });

  it("gives a different recipient ownership inside the suite transaction", async () => {
    const { wallet, run } = clients();
    const recipient = CANONICAL_BASE_CONTRACTS.WETH;
    await run(
      { ...noSeed, selectedArchetype: "aave_v3_yield", recipientAdminAddress: recipient },
      signer
    );
    expect(config(wallet).admin).toBe(recipient);
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("deploys nothing when a setting is outside the contract limits", async () => {
    const { wallet, run } = clients();
    const staking = { ...noSeed, selectedArchetype: "staking_rewards" as const };
    await expect(run({ ...staking, earlyUnstakeFeeBps: 5001 })).rejects.toThrow("Unstake fee");
    await expect(run({ ...staking, stakingLockDays: 1.5 })).rejects.toThrow("Staking lock");
    await expect(run({ ...staking, stakingLockDays: 366 })).rejects.toThrow("Staking lock");
    await expect(
      run({ ...noSeed, selectedArchetype: "aave_v3_yield", performanceFeeBps: 3001 })
    ).rejects.toThrow("Performance fee");
    expect(wallet.deployContract).not.toHaveBeenCalled();
  });

  it("ignores staking and vault settings on the plain token card", async () => {
    const { wallet, run } = clients();
    await run({ ...noSeed, earlyUnstakeFeeBps: 9999, performanceFeeBps: 9999 });
    expect(wallet.deployContract).toHaveBeenCalledTimes(1);
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("names the token when the suite transaction is rejected", async () => {
    const { wallet, run } = clients();
    wallet.deployContract
      .mockResolvedValueOnce("0x01")
      .mockRejectedValueOnce(new Error("User rejected"));
    await expect(run({ ...noSeed, selectedArchetype: "staking_rewards" })).rejects.toThrow(
      /Token 0x.* is deployed, but its staking contracts were not: User rejected/
    );
  });
});

describe("Aerodrome seeding", () => {
  it("uses Aerodrome's own addLiquidityETH on a volatile pool", async () => {
    const { wallet, run } = clients();
    const result = await run({ ...form, selectedDex: "aerodrome" });
    expect(result.liquiditySeedingError).toBeUndefined();
    const seed = wallet.writeContract.mock.calls.at(-1)![0];
    expect(seed.address).toBe(CANONICAL_BASE_CONTRACTS.AerodromeRouter);
    expect(seed.abi).toBe(AERODROME_ROUTER_ABI);
    expect(seed.args[1]).toBe(false);
    expect(encodeFunctionData(seed).slice(0, 10)).not.toBe("0xf305d719");
  });

  it("keeps the V2 call for V2 routers and reports a reverted seed", async () => {
    const { wallet, run } = clients(true);
    const result = await run({ ...form, selectedDex: "uniswap_v2" });
    expect(result.liquiditySeedingError).toContain("reverted");
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
  });
});

describe("launchpad fee", () => {
  it("refuses a wallet short of the fee before deploying anything", async () => {
    const { wallet, run } = clients(false, 10_000_000n, 9_000_000n);
    await expect(run({ ...form, enableDexSeeding: false })).rejects.toThrow(
      "The launch fee is 10 USDC and this wallet holds 9 USDC. Nothing was deployed."
    );
    expect(wallet.deployContract).not.toHaveBeenCalled();
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("skips the fee step entirely when feeAmount() reads as 0", async () => {
    const { wallet, run, publicClient } = clients(false, 0n);
    await run({ ...form, enableDexSeeding: false });
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "feeAmount" })
    );
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("approves and pays the live launch fee, tagging the deployed token", async () => {
    const { wallet, run } = clients(false, 10_000_000n);
    await run({ ...form, enableDexSeeding: false });
    expect(wallet.writeContract).toHaveBeenCalledTimes(2);

    const approveCall = wallet.writeContract.mock.calls[0]![0];
    expect(approveCall.functionName).toBe("approve");
    expect(approveCall.address).toBe(CANONICAL_BASE_CONTRACTS.USDC);
    expect(approveCall.args).toEqual([CANONICAL_BASE_CONTRACTS.LaunchpadFees, 10_000_000n]);

    const payCall = wallet.writeContract.mock.calls[1]![0];
    expect(payCall.functionName).toBe("payLaunchFee");
    expect(payCall.address).toBe(CANONICAL_BASE_CONTRACTS.LaunchpadFees);
    expect(payCall.args).toEqual(["0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263"]);
  });
});
