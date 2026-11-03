import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import fixture from "@/lib/launchpad/stakingContract.fixture.json";

import { LaunchStakingPanel } from "./LaunchStakingPanel";

// Real runtime code of a Staking-card launch (Base fork), so the contract check runs for real.
const STAKING = fixture.staking as `0x${string}`;
const TOKEN = fixture.token as `0x${string}`;
const USER = "0x00000000000000000000000000000000000b0b01";
const E18 = 10n ** 18n;
const NOW = Math.floor(Date.now() / 1000);

const mocks = vi.hoisted(() => ({
  account: { address: "" as string | undefined, chainId: 8453 },
  code: { data: undefined as string | undefined, isLoading: false },
  core: undefined as unknown[] | undefined,
  details: [] as unknown[],
  tiers: [] as unknown[],
  refetch: vi.fn(),
  allowance: vi.fn(),
  simulate: vi.fn(),
  estimate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  useBytecode: () => mocks.code,
  usePublicClient: () => ({
    readContract: mocks.allowance,
    simulateContract: mocks.simulate,
    estimateContractGas: mocks.estimate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWalletClient: () => ({ data: { writeContract: mocks.write } }),
  // The panel makes three batches: staking state, token details, tiers.
  useReadContracts: ({ contracts }: { contracts: Array<{ functionName: string }> }) => ({
    data:
      contracts[0]?.functionName === "token"
        ? mocks.core
        : contracts[0]?.functionName === "name"
          ? mocks.details
          : mocks.tiers,
    refetch: mocks.refetch,
  }),
}));

const TIERS = [
  [100n * E18, 1000],
  [1_000n * E18, 2500],
  [10_000n * E18, 5000],
  [100_000n * E18, 7500],
] as const;

const position = ({
  staked = 0n,
  unlock = 0,
  tier = 0,
  token = TOKEN,
}: { staked?: bigint; unlock?: number; tier?: number; token?: string } = {}) => [
  { result: token },
  { result: 7n * 86_400n }, // lock
  { result: 200 }, // 2% unstake fee
  { result: 4n },
  { result: tier },
  { result: staked },
  { result: BigInt(unlock) },
];

const panel = (variant: "card" | "page" = "card") =>
  render(<LaunchStakingPanel stakingAddress={STAKING} variant={variant} />);
const typeAmount = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Amount of STKQA/), { target: { value } });
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const calls = () =>
  mocks.write.mock.calls.map(([req]) => req as { functionName: string; args: unknown[] });

describe("LaunchStakingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: USER, chainId: 8453 };
    mocks.code = { data: fixture.code, isLoading: false };
    mocks.core = position();
    mocks.details = [
      { result: "Stake Check" },
      { result: "STKQA" },
      { result: 18 },
      { result: 50_000n * E18 },
    ];
    mocks.tiers = TIERS.map((t) => ({ result: t }));
    mocks.allowance.mockResolvedValue(0n);
    mocks.simulate.mockImplementation((call: { functionName: string; args: unknown[] }) =>
      Promise.resolve({ request: { functionName: call.functionName, args: call.args } })
    );
    mocks.estimate.mockResolvedValue(100_000n);
    mocks.write.mockResolvedValue("0x01");
    mocks.receipt.mockResolvedValue({ status: "success" });
  });

  it("shows the lock, fee, balances, tiers and how much more reaches the next tier", () => {
    mocks.core = position({ staked: 150n * E18, tier: 1000, unlock: NOW + 86_400 });
    panel();
    expect(screen.getByText("7 days lock · 2% unstake fee")).toBeTruthy();
    expect(screen.getByText("150")).toBeTruthy(); // staked
    expect(screen.getByText("50,000")).toBeTruthy(); // wallet
    expect(screen.getByText("10%")).toBeTruthy(); // tier
    expect(screen.getByText(/Stake 850 more for 25%/)).toBeTruthy();
    expect(screen.getByText(/Locked until/)).toBeTruthy();
  });

  it("stays hidden on a token card when the contract is not a launchpad staking contract", () => {
    mocks.core = position({ token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" });
    expect(panel().container.textContent).toBe("");
  });

  it("explains on the shared-link page when the contract is not recognised", () => {
    mocks.code = { data: "0x6080604052", isLoading: false };
    panel("page");
    expect(screen.getByText(/not a launchpad staking contract on Base/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stake" })).toBeNull();
  });

  it("says it is checking while the contract code loads", () => {
    mocks.code = { data: undefined, isLoading: true };
    panel("page");
    expect(screen.getByText(/Checking this staking contract/)).toBeTruthy();
  });

  it("shows the token on the shared-link page", () => {
    panel("page");
    expect(screen.getByText("(Stake Check)")).toBeTruthy();
    expect(screen.getByRole("link", { name: TOKEN })).toBeTruthy();
  });

  it("approves exactly the amount, then stakes it", async () => {
    panel();
    typeAmount("250.5");
    fireEvent.click(button("Stake"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Staked 250.5 STKQA."));
    expect(calls().map((c) => c.functionName)).toEqual(["approve", "stake"]);
    expect(calls()[0]?.args).toEqual([STAKING, 2505n * 10n ** 17n]);
    expect(calls()[1]?.args).toEqual([2505n * 10n ** 17n]);
  });

  it("skips the approval when the allowance already covers the amount", async () => {
    mocks.allowance.mockResolvedValue(1_000n * E18);
    panel();
    typeAmount("10");
    fireEvent.click(button("Stake"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(calls().map((c) => c.functionName)).toEqual(["stake"]);
  });

  it("refuses to stake more than the wallet holds", async () => {
    panel();
    typeAmount("60000");
    fireEvent.click(button("Stake"));
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith("This wallet holds 50,000 STKQA.")
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("warns that staking more restarts the lock on the whole stake", () => {
    mocks.core = position({ staked: 150n * E18, unlock: NOW + 86_400 });
    panel();
    typeAmount("1");
    expect(
      screen.getByText("Staking more restarts the 7 days lock on your whole stake.")
    ).toBeTruthy();
  });

  it("keeps Unstake disabled until the unlock time", () => {
    mocks.core = position({ staked: 150n * E18, unlock: NOW + 86_400 });
    panel();
    typeAmount("10");
    expect(button("Unstake").disabled).toBe(true);
    expect(button("Stake").disabled).toBe(false);
  });

  it("unstakes once unlocked and shows what comes back after the fee", async () => {
    mocks.core = position({ staked: 150n * E18, unlock: NOW - 60 });
    panel();
    expect(screen.getByText("Unlocked")).toBeTruthy();
    typeAmount("100");
    expect(screen.getByText("Unstaking this returns 98 STKQA after the 2% fee.")).toBeTruthy();
    fireEvent.click(button("Unstake"));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Unstaked 100 STKQA."));
    expect(calls()).toEqual([
      expect.objectContaining({ functionName: "unstake", args: [100n * E18] }),
    ]);
  });

  it("does not allow unstaking more than is staked", () => {
    mocks.core = position({ staked: 150n * E18, unlock: NOW - 60 });
    panel();
    typeAmount("151");
    expect(button("Unstake").disabled).toBe(true);
  });

  it("asks for Base before sending anything", async () => {
    mocks.account = { address: USER, chainId: 1 };
    panel();
    typeAmount("10");
    fireEvent.click(button("Stake"));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Please switch to Base Mainnet."));
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("copies a link holders can open", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    panel();
    fireEvent.click(screen.getByRole("button", { name: /Copy staking link/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/stake?contract=${STAKING}`)
    );
  });
});
