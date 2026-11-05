import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { decodeFunctionData, type Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stakerActionsAbi } from "@/lib/mrwd-staker";

import { MrwdLpStakerPanel } from "./MrwdLpStakerPanel";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const STRANGER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const STAKER = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";
const zero = "0x0000000000000000000000000000000000000000";
const FAR = 9_999_999_999n;
const quarterAt = (startTime: bigint, endTime: bigint, status = 1) => ({
  startTime,
  endTime,
  status,
});
const idOf = (i: number) => `0x${i.toString(16).padStart(64, "0")}`;

const mocks = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, chainId: 8453 as number },
  depositOwner: "",
  badId: "",
  portfolio: {} as Record<string, unknown>,
  banked: 0n,
  now: 100n,
  periods: [] as Array<{ startTime: bigint; endTime: bigint; status: number }>,
  /** Index of the quarter the positions are staked in; -1 for none. */
  stakedIn: 0,
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const read = ({ functionName, args }: { functionName: string; args?: readonly unknown[] }) => {
  if (mocks.badId && String(args?.[0]) === mocks.badId)
    return Promise.reject(new Error("invalid id"));
  const i = Number(args?.[0] ?? 0);
  const q = mocks.periods[i];
  const values: Record<string, unknown> = {
    periodCount: BigInt(mocks.periods.length),
    period: q && [{ amount: 1n, startTime: q.startTime, endTime: q.endTime }, q.status],
    incentiveKey: q && {
      rewardToken: zero,
      pool: zero,
      startTime: q.startTime,
      endTime: q.endTime,
      refundee: zero,
    },
    incentiveId: idOf(i),
    slot0: [1n, 0, 0, 0, 0, 0, true],
    incentives: [100n, 0n, 1n],
    rewards: mocks.banked,
    ownerOf: STAKER,
    positions: [0n, zero, zero, zero, 3000, -10, 10, 1n, 0n, 0n, 0n, 0n],
    deposits: [mocks.depositOwner, 1, -10, 10],
    stakes: [0n, args?.[1] === idOf(mocks.stakedIn) ? 1n : 0n],
    getRewardInfo: [5n * 10n ** 18n, 0n],
  };
  return Promise.resolve(values[functionName]);
};

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    getBlock: () => Promise.resolve({ number: 1n, timestamp: mocks.now }),
    readContract: read,
    simulateContract: mocks.simulate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWriteContract: () => ({ writeContractAsync: mocks.write }),
}));
vi.mock("@/hooks/useStakedPortfolio", () => ({
  useStakedPortfolio: () => mocks.portfolio,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

const position = (tokenId: string, overrides: Record<string, unknown> = {}) => ({
  tokenId,
  custody: "staker",
  token0: "0x4200000000000000000000000000000000000006",
  token1: "0xC17227AAa33C54634B6cE7AD0bf33A156563c179",
  fee: 3000,
  ...overrides,
});

const renderBare = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MrwdLpStakerPanel />
    </QueryClientProvider>
  );

const renderPanel = async () => {
  renderBare();
  await screen.findAllByText("#6383553", { exact: false });
};

describe("MrwdLpStakerPanel actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: OWNER, chainId: 8453 };
    mocks.depositOwner = OWNER;
    mocks.badId = "";
    mocks.portfolio = {
      data: { positions: [position("6383553"), position("6383541")], incomplete: false },
      isPending: false,
      isFetching: false,
      isError: false,
    };
    mocks.banked = 0n;
    mocks.now = 100n;
    mocks.periods = [quarterAt(1n, FAR)];
    mocks.stakedIn = 0;
    mocks.simulate.mockResolvedValue({ result: [0n, 0n] });
    mocks.write.mockResolvedValue("0x01");
    mocks.receipt.mockResolvedValue({ status: "success" });
  });

  it("shows actions to the position owner, whatever the address casing", async () => {
    mocks.account = { address: OWNER.toLowerCase(), chainId: 8453 };
    await renderPanel();
    expect(screen.getAllByRole("button", { name: "Claim" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Unstake" }).length).toBeGreaterThan(0);
  });

  it("hides actions from a wallet that does not own the position", async () => {
    mocks.account = { address: STRANGER, chainId: 8453 };
    await renderPanel();
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unstake" })).toBeNull();
  });

  it("shows no one else's positions when no wallet is connected", async () => {
    mocks.account = { address: undefined, chainId: 8453 };
    mocks.portfolio = { isPending: true, isFetching: false, isError: false };
    renderBare();
    expect(await screen.findByText(/Connect a wallet to load your positions/)).toBeTruthy();
    expect(screen.queryByText(/#63/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
  });

  it("lists exactly the connected wallet's discovered positions", async () => {
    mocks.portfolio = {
      data: { positions: [position("111")], incomplete: false },
      isPending: false,
      isFetching: false,
      isError: false,
    };
    renderBare();
    expect(await screen.findByText("#111", { exact: false })).toBeTruthy();
    expect(screen.queryByText("#6383553", { exact: false })).toBeNull();
  });

  it("leaves out the wallet's positions in other pools", async () => {
    mocks.portfolio = {
      data: { positions: [position("111", { fee: 500 })], incomplete: false },
      isPending: false,
      isFetching: false,
      isError: false,
    };
    renderBare();
    expect(await screen.findByText(/no positions in this pool/)).toBeTruthy();
  });

  it("says so when a position ID does not exist, and keeps the other rows", async () => {
    mocks.badId = "999";
    await renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Inspect V3 NFT/), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: /Add Position/ }));
    expect(await screen.findByText(/No position found for #999/)).toBeTruthy();
    expect(screen.getAllByText("#6383553", { exact: false }).length).toBeGreaterThan(0);
  });

  it("warns when discovery could not finish", async () => {
    mocks.portfolio = {
      data: { positions: [position("111")], incomplete: true },
      isPending: false,
      isFetching: false,
      isError: false,
    };
    renderBare();
    expect(await screen.findByText(/this list may be incomplete/)).toBeTruthy();
  });

  it("claims through the staker after simulating", async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: "Claim" })[0]!);
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0]![0]).toMatchObject({
      address: STAKER,
      functionName: "multicall",
      chainId: 8453,
    });
  });

  it("refuses to sign if ownership changed since the table loaded", async () => {
    await renderPanel();
    mocks.depositOwner = STRANGER;
    fireEvent.click(screen.getAllByRole("button", { name: "Claim" })[0]!);
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("Only the owner"))
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("needs a second click before unstaking", async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: "Unstake" })[0]!);
    expect(mocks.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm: stops earning" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  });

  it("does not send from the wrong chain", async () => {
    mocks.account = { address: OWNER, chainId: 1 };
    await renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: "Claim" })[0]!);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("reports a reverted transaction as a failure", async () => {
    mocks.receipt.mockResolvedValue({ status: "reverted" });
    await renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: "Claim" })[0]!);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Transaction reverted"));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("offers banked rewards only to their connected owner", async () => {
    mocks.banked = 10n ** 18n;
    await renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Claim to Wallet" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
  });

  it("moves positions parked in the ended quarter into the running one, in one transaction", async () => {
    mocks.periods = [quarterAt(1n, 50n), quarterAt(50n, FAR)];
    mocks.stakedIn = 0;
    await renderPanel();
    expect(screen.getByText(/2 positions are not earning Quarter 2 rewards/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Move all to Quarter 2" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    const calls = mocks.write.mock.calls[0]![0].args[0] as Hex[];
    const decoded = calls.map((data) => decodeFunctionData({ abi: stakerActionsAbi, data }));
    expect(decoded.map((c) => c.functionName)).toEqual([
      "unstakeToken",
      "stakeToken",
      "unstakeToken",
      "stakeToken",
      "claimReward",
    ]);
    expect((decoded[0]!.args![0] as { endTime: bigint }).endTime).toBe(50n);
    expect((decoded[1]!.args![0] as { startTime: bigint }).startTime).toBe(50n);
  });

  it("re-stakes positions a finalize left unstaked", async () => {
    mocks.periods = [quarterAt(1n, 50n), quarterAt(50n, FAR)];
    mocks.stakedIn = -1;
    await renderPanel();
    fireEvent.click(screen.getAllByRole("button", { name: "Stake in Quarter 2" })[0]!);
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    const calls = mocks.write.mock.calls[0]![0].args[0] as Hex[];
    expect(
      calls.map((data) => decodeFunctionData({ abi: stakerActionsAbi, data }).functionName)
    ).toEqual(["stakeToken", "claimReward"]);
  });

  it("offers no move between quarters and says the next one is not created", async () => {
    mocks.periods = [quarterAt(1n, 50n), quarterAt(200n, 300n, 0)];
    mocks.stakedIn = 0;
    await renderPanel();
    expect(screen.getByText(/Quarter 2 starts .* has not been created yet/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Move all|Stake in/ })).toBeNull();
  });

  it("does not offer a move to a wallet that does not own the positions", async () => {
    mocks.periods = [quarterAt(1n, 50n), quarterAt(50n, FAR)];
    mocks.account = { address: STRANGER, chainId: 8453 };
    await renderPanel();
    expect(screen.queryByRole("button", { name: /Move all|Stake in/ })).toBeNull();
  });
});
