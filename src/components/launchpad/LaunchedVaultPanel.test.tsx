import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LaunchedVaultPanel } from "./LaunchedVaultPanel";

const USER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const VAULT = "0x4200000000000000000000000000000000000006";

const mocks = vi.hoisted(() => ({
  account: { address: "" as string | undefined, chainId: 8453 },
  reads: [] as unknown[],
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
  usePublicClient: () => ({
    readContract: mocks.allowance,
    simulateContract: mocks.simulate,
    estimateContractGas: mocks.estimate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWalletClient: () => ({ data: { writeContract: mocks.write } }),
  useReadContracts: () => ({ data: mocks.reads, refetch: mocks.refetch }),
}));

const state = (shares: bigint, balance = 2_000_000_000n) => [
  { result: USDC },
  { result: 2_000_000_000n }, // totalAssets
  { result: 2_000_000_000_000_000n }, // totalShares
  { result: shares },
  { result: 1500 },
  { result: balance },
];

const panel = () => render(<LaunchedVaultPanel vaultAddress={VAULT} label="Aave v3 vault" />);
const typeAmount = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Deposit USDC/), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("LaunchedVaultPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: USER, chainId: 8453 };
    mocks.reads = state(1_000_000_000_000_000n);
    mocks.allowance.mockResolvedValue(0n);
    mocks.simulate.mockImplementation((call: { functionName: string }) =>
      Promise.resolve({ request: { functionName: call.functionName } })
    );
    mocks.estimate.mockResolvedValue(200_000n);
    mocks.write.mockResolvedValue("0x01");
    mocks.receipt.mockResolvedValue({ status: "success" });
  });

  it("shows the position's USDC value and the fee", () => {
    panel();
    expect(screen.getByText("1,000 USDC")).toBeTruthy();
    expect(screen.getByText("15% fee on yield")).toBeTruthy();
  });

  it("stays hidden for a vault from a retired card", () => {
    mocks.reads = [{ error: new Error("no such function") }];
    expect(panel().container.textContent).toBe("");
  });

  it("stays hidden for a vault that does not hold USDC", () => {
    mocks.reads = [{ result: VAULT }, ...state(0n).slice(1)];
    expect(panel().container.textContent).toBe("");
  });

  it("approves the exact amount, then deposits with the gas buffer", async () => {
    panel();
    typeAmount("250.5");
    click("Deposit");
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(2));
    expect(mocks.simulate.mock.calls[0]![0]).toMatchObject({
      functionName: "approve",
      args: [VAULT, 250_500_000n],
    });
    expect(mocks.simulate.mock.calls[1]![0]).toMatchObject({
      address: VAULT,
      functionName: "deposit",
      args: [250_500_000n],
      account: USER,
    });
    expect(mocks.write.mock.calls[1]![0].gas).toBe(300_000n);
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
  });

  it("skips approval when the allowance already covers it", async () => {
    mocks.allowance.mockResolvedValue(250_500_000n);
    panel();
    typeAmount("250.5");
    click("Deposit");
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(mocks.write.mock.calls[0]![0].functionName).toBe("deposit");
  });

  it("asks for nothing when the wallet is short of USDC", async () => {
    mocks.reads = state(0n, 100_000_000n);
    panel();
    typeAmount("250");
    click("Deposit");
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("This wallet holds 100 USDC."));
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("stops if the approval reverts", async () => {
    mocks.receipt.mockResolvedValueOnce({ status: "reverted" });
    panel();
    typeAmount("10");
    click("Deposit");
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Approval reverted"));
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });

  it("withdraws all shares with the gas buffer", async () => {
    panel();
    click("Withdraw all");
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(mocks.simulate.mock.calls[0]![0]).toMatchObject({
      functionName: "withdraw",
      args: [1_000_000_000_000_000n],
    });
    expect(mocks.write.mock.calls[0]![0].gas).toBe(300_000n);
  });

  it("reports a reverted withdrawal as a failure", async () => {
    mocks.receipt.mockResolvedValue({ status: "reverted" });
    panel();
    click("Withdraw all");
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Vault transaction reverted"));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("disables Withdraw with no position, and Deposit with no valid amount", () => {
    mocks.reads = state(0n);
    panel();
    const disabled = (name: string) =>
      (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;
    expect(disabled("Withdraw all")).toBe(true);
    expect(disabled("Deposit")).toBe(true);
    typeAmount("abc");
    expect(disabled("Deposit")).toBe(true);
    typeAmount("1");
    expect(disabled("Deposit")).toBe(false);
  });

  it("refuses to send from the wrong chain", async () => {
    mocks.account = { address: USER, chainId: 1 };
    panel();
    click("Withdraw all");
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
