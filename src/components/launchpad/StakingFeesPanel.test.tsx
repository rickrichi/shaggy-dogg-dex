import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StakingFeesPanel } from "./StakingFeesPanel";

const ADMIN = "0x00000000000000000000000000000000000C0FFE";
const STAKING = "0x4200000000000000000000000000000000000006";
const OTHER = "0x0000000000000000000000000000000000000BAD";

const mocks = vi.hoisted(() => ({
  account: { address: undefined as string | undefined, chainId: 8453 as number },
  reads: undefined as unknown,
  refetch: vi.fn(),
  simulateContract: vi.fn(),
  writeContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    simulateContract: mocks.simulateContract,
    waitForTransactionReceipt: mocks.waitForTransactionReceipt,
  }),
  useWalletClient: () => ({ data: { writeContract: mocks.writeContract } }),
  useReadContracts: () => ({ data: mocks.reads, refetch: mocks.refetch }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

const panel = () =>
  render(<StakingFeesPanel stakingAddress={STAKING} tokenSymbol="FRK" />).container;

describe("StakingFeesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: ADMIN, chainId: 8453 };
    mocks.reads = [{ result: 25n * 10n ** 18n }, { result: ADMIN }];
    mocks.simulateContract.mockResolvedValue({ request: { functionName: "withdrawFees" } });
    mocks.writeContract.mockResolvedValue("0x01");
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  });

  it("shows the admin the collected fees", () => {
    panel();
    expect(screen.getByText("25 FRK")).toBeTruthy();
  });

  it("stays hidden for wallets that are not the staking admin", () => {
    mocks.account = { address: OTHER, chainId: 8453 };
    expect(panel().textContent).toBe("");
  });

  it("stays hidden for contracts launched before withdrawFees existed", () => {
    mocks.reads = [{ error: new Error("reverted") }, { result: ADMIN }];
    expect(panel().textContent).toBe("");
  });

  it("disables the button when nothing has been collected", () => {
    mocks.reads = [{ result: 0n }, { result: ADMIN }];
    panel();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("withdraws the whole collected amount to the admin", async () => {
    panel();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
    expect(mocks.simulateContract.mock.calls[0]![0]).toMatchObject({
      address: STAKING,
      functionName: "withdrawFees",
      args: [ADMIN, 25n * 10n ** 18n],
      account: ADMIN,
    });
    expect(mocks.writeContract).toHaveBeenCalledWith({ functionName: "withdrawFees" });
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });

  it("reports a reverted withdrawal instead of success", async () => {
    mocks.waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    panel();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Withdrawal reverted"));
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("refuses to send from the wrong chain", async () => {
    mocks.account = { address: ADMIN, chainId: 1 };
    panel();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.writeContract).not.toHaveBeenCalled();
  });
});
