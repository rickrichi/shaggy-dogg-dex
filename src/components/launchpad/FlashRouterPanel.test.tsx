import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FlashRouterPanel } from "./FlashRouterPanel";

const ADMIN = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ROUTER = "0x1111111111111111111111111111111111111111";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const mocks = vi.hoisted(() => ({
  account: { address: "" as string | undefined, chainId: 8453 },
  reads: [] as unknown[],
  refetch: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    simulateContract: mocks.simulate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWalletClient: () => ({ data: { writeContract: mocks.write } }),
  useReadContracts: () => ({ data: mocks.reads, refetch: mocks.refetch }),
}));

const state = (usdc: bigint) => [
  { status: "success", result: ADMIN },
  { status: "success", result: false },
  { status: "success", result: usdc },
];
const panel = () => render(<FlashRouterPanel routerAddress={ROUTER} />);

describe("FlashRouterPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    mocks.account = { address: ADMIN, chainId: 8453 };
    mocks.reads = state(5_000_000n);
    mocks.simulate.mockResolvedValue({ request: { functionName: "rescueTokens" } });
    mocks.write.mockResolvedValue("0x01");
    mocks.receipt.mockResolvedValue({ status: "success" });
  });

  it("shows the admin what the router holds", () => {
    panel();
    expect(screen.getByText("5")).toBeTruthy();
  });

  it("stays hidden from anyone but the admin", () => {
    mocks.account = { address: OTHER, chainId: 8453 };
    expect(panel().container.textContent).toBe("");
  });

  it("stays hidden for the older flash borrower, which is not a router", () => {
    mocks.reads = [
      { status: "success", result: ADMIN },
      { status: "failure", error: new Error("no such function") },
      { status: "success", result: 0n },
    ];
    expect(panel().container.textContent).toBe("");
  });

  it("makes this router the Arbitrage page's active router", () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Use for arbitrage" }));
    expect(localStorage.getItem("shaggy_dogg_atomic_router")).toBe(ROUTER);
    expect(mocks.navigate).toHaveBeenCalledWith("/launchpad/arbitrage/flashloan");
  });

  it("withdraws the router's whole USDC balance to the admin", async () => {
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw USDC" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.simulate.mock.calls[0]![0]).toMatchObject({
      functionName: "rescueTokens",
      args: [USDC, ADMIN, 5_000_000n],
      account: ADMIN,
    });
  });

  it("disables withdrawal when the router holds nothing", () => {
    mocks.reads = state(0n);
    panel();
    expect(
      (screen.getByRole("button", { name: "Withdraw USDC" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("reports a reverted withdrawal as a failure", async () => {
    mocks.receipt.mockResolvedValue({ status: "reverted" });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw USDC" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Withdrawal reverted"));
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
