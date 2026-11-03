import { MemoryRouter } from "react-router-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V3LiquidityManager } from "./V3LiquidityManager";

const USER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";

const mocks = vi.hoisted(() => ({
  account: { address: "" as string | undefined, isConnected: true, chainId: 8453 },
  portfolio: {} as Record<string, unknown>,
  refetch: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.error, success: mocks.success, info: vi.fn() },
}));
vi.mock("@/hooks/useStakedPortfolio", () => ({ useStakedPortfolio: () => mocks.portfolio }));
vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    simulateContract: mocks.simulate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWalletClient: () => ({
    data: {
      getChainId: () => Promise.resolve(8453),
      getAddresses: () => Promise.resolve([USER]),
      writeContract: mocks.write,
    },
  }),
}));

const position = (tokenId: string, custody: string) => ({
  tokenId,
  custody,
  token0Symbol: "WETH",
  token1Symbol: "MRWD",
  fee: 3000,
  tickLower: -887220,
  tickUpper: 887220,
  liquidity: "1000",
});

const ready = (positions: unknown[], incomplete = false) => ({
  data: { positions, incomplete },
  isPending: false,
  isFetching: false,
  isError: false,
  refetch: mocks.refetch,
});

const panel = () =>
  render(
    <MemoryRouter>
      <V3LiquidityManager />
    </MemoryRouter>
  );

describe("V3LiquidityManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: USER, isConnected: true, chainId: 8453 };
    mocks.portfolio = ready([]);
    mocks.simulate.mockResolvedValue({ request: {} });
    mocks.write.mockResolvedValue("0x01");
    mocks.receipt.mockResolvedValue({ status: "success" });
  });

  it("lists positions in every custody with the right action", () => {
    mocks.portfolio = ready([
      position("1", "wallet"),
      position("2", "staker"),
      position("3", "timelock"),
    ]);
    panel();
    expect(screen.getByText("NFT #2")).toBeTruthy();
    expect(screen.getByText("Staked")).toBeTruthy();
    expect(screen.getByText("Timelocked")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Collect Fees" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Manage on Stake" }).getAttribute("href")).toBe(
      "/stake"
    );
    expect(screen.getByText("Harvest in the locker below")).toBeTruthy();
  });

  it("does not offer Collect on a position the wallet cannot collect from", () => {
    mocks.portfolio = ready([position("2", "staker")]);
    panel();
    expect(screen.queryByRole("button", { name: "Collect Fees" })).toBeNull();
  });

  it("collects from a wallet-held position and refreshes", async () => {
    mocks.portfolio = ready([position("1", "wallet")]);
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Collect Fees" }));
    await waitFor(() => expect(mocks.refetch).toHaveBeenCalled());
    const args = mocks.simulate.mock.calls[0]![0].args[0];
    expect(args.tokenId).toBe(1n);
    expect(args.recipient).toBe(USER);
  });

  it("reports a reverted collect as a failure", async () => {
    mocks.portfolio = ready([position("1", "wallet")]);
    mocks.receipt.mockResolvedValue({ status: "reverted" });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Collect Fees" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Collect reverted"));
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("says when a wallet truly has no positions", () => {
    panel();
    expect(screen.getByText("No Uniswap V3 Positions Found")).toBeTruthy();
    expect(screen.queryByText(/V3 Position Creator/)).toBeNull();
  });

  it("does not claim 'none found' while loading, on failure, or with no wallet", () => {
    mocks.portfolio = { isPending: true, isFetching: true, isError: false };
    const loading = panel();
    expect(screen.getByText(/Finding your positions/)).toBeTruthy();
    loading.unmount();

    mocks.portfolio = { isPending: false, isFetching: false, isError: true };
    const failed = panel();
    expect(screen.getByRole("alert").textContent).toContain("Could not load");
    failed.unmount();

    mocks.account = { address: undefined, isConnected: false, chainId: 8453 };
    mocks.portfolio = { isPending: true, isFetching: false, isError: false };
    panel();
    expect(screen.getByText("Connect a wallet to see your positions")).toBeTruthy();
    expect(screen.queryByText("No Uniswap V3 Positions Found")).toBeNull();
  });

  it("warns when discovery could not finish", () => {
    mocks.portfolio = ready([position("1", "wallet")], true);
    panel();
    expect(screen.getByRole("status").textContent).toContain("may be incomplete");
  });
});
