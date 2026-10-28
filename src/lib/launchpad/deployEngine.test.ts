import { decodeFunctionData, type PublicClient, type WalletClient } from "viem";
import { base } from "viem/chains";
import { describe, expect, it, vi } from "vitest";

import { NONFUNGIBLE_POSITION_MANAGER_ABI } from "@/lib/amm/uniswap-v3";

import { LAUNCHPAD_ARTIFACTS } from "./artifacts";
import { CANONICAL_BASE_CONTRACTS } from "./constants";
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
function clients(revertWrap = false, launchFee = 0n) {
  const deployContract = vi.fn().mockResolvedValue("0x01");
  const writeContract = vi.fn().mockResolvedValue("0x02");
  const wallet = { getChainId: vi.fn().mockResolvedValue(8453), deployContract, writeContract };
  const publicClient = {
    chain: base,
    // Defaults to 0 so existing tests below never trigger the launch-fee step at all
    // (executeLaunchpadDeployment skips it entirely when feeAmount() reads as 0).
    readContract: vi.fn().mockResolvedValue(launchFee),
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

describe("launchpad fee", () => {
  it("skips the fee step entirely when feeAmount() reads as 0", async () => {
    const { wallet, run, publicClient } = clients(false, 0n);
    await run({ ...form, enableDexSeeding: false });
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "feeAmount" })
    );
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("approves and pays the live launch fee, tagging the deployed token", async () => {
    const { wallet, run } = clients(false, 500_000_000n);
    await run({ ...form, enableDexSeeding: false });
    expect(wallet.writeContract).toHaveBeenCalledTimes(2);

    const approveCall = wallet.writeContract.mock.calls[0]![0];
    expect(approveCall.functionName).toBe("approve");
    expect(approveCall.address).toBe(CANONICAL_BASE_CONTRACTS.USDC);
    expect(approveCall.args).toEqual([CANONICAL_BASE_CONTRACTS.LaunchpadFees, 500_000_000n]);

    const payCall = wallet.writeContract.mock.calls[1]![0];
    expect(payCall.functionName).toBe("payLaunchFee");
    expect(payCall.address).toBe(CANONICAL_BASE_CONTRACTS.LaunchpadFees);
    expect(payCall.args).toEqual(["0xb8f3D5143ffddB99688BB31E7c2c3894a1E17263"]);
  });
});
