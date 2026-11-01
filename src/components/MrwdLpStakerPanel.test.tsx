import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MrwdLpStakerPanel } from "./MrwdLpStakerPanel";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const STRANGER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const STAKER = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";
const zero = "0x0000000000000000000000000000000000000000";
const key = { rewardToken: zero, pool: zero, startTime: 1n, endTime: 9_999_999_999n, refundee: zero };

const mocks = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, chainId: 8453 as number },
  depositOwner: "",
  banked: 0n,
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const read = ({ functionName }: { functionName: string }) => {
  const values: Record<string, unknown> = {
    incentiveKey: key,
    incentiveId: `0x${"11".repeat(32)}`,
    slot0: [1n, 0, 0, 0, 0, 0, true],
    incentives: [100n, 0n, 1n],
    rewards: mocks.banked,
    ownerOf: STAKER,
    positions: [0n, zero, zero, zero, 3000, -10, 10, 1n, 0n, 0n, 0n, 0n],
    deposits: [mocks.depositOwner, 1, -10, 10],
    stakes: [0n, 1n],
    getRewardInfo: [5n * 10n ** 18n, 0n],
  };
  return Promise.resolve(values[functionName]);
};

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    getBlock: () => Promise.resolve({ number: 1n, timestamp: 100n }),
    readContract: read,
    simulateContract: mocks.simulate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWriteContract: () => ({ writeContractAsync: mocks.write }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

const renderPanel = async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MrwdLpStakerPanel />
    </QueryClientProvider>
  );
  await screen.findAllByText("#6383553", { exact: false });
};

describe("MrwdLpStakerPanel actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: OWNER, chainId: 8453 };
    mocks.depositOwner = OWNER;
    mocks.banked = 0n;
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

  it("hides actions when no wallet is connected", async () => {
    mocks.account = { address: undefined, chainId: 8453 };
    await renderPanel();
    expect(screen.queryByRole("button", { name: "Claim" })).toBeNull();
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
});
