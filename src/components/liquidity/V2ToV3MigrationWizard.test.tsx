import { MemoryRouter } from "react-router-dom";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseUnits } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { encodeSqrtPriceX96, WETH_BASE } from "@/lib/amm/uniswap-v3";

import { V2ToV3MigrationWizard } from "./V2ToV3MigrationWizard";

const SD_TOKEN = "0x051c758521971f5c5a84edaf18eea12854375469";
const LIVE_V3_POOL = "0x449730674404A29856C6b1e5941549D73c5b8f10";

// Token0 is SD (0x051c... < 0x4200... WETH). Suppose 1,000,000 SD pairs with 1 WETH.
const POOL_SQRT_PRICE_X96 = encodeSqrtPriceX96(
  parseUnits("1000000", 18),
  parseUnits("1", 18)
);

const mocks = vi.hoisted(() => ({
  account: {
    address: undefined as string | undefined,
    chainId: undefined as number | undefined,
    isConnected: false,
  },
  readContract: vi.fn(),
  getBalance: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    readContract: mocks.readContract,
    getBalance: mocks.getBalance,
  }),
  useWalletClient: () => ({ data: undefined }),
}));

describe("V2ToV3MigrationWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: undefined, chainId: undefined, isConnected: false };
    mocks.getBalance.mockResolvedValue(parseUnits("0.5", 18));
    mocks.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      switch (functionName) {
        case "getPool":
          return LIVE_V3_POOL;
        case "token0":
          return SD_TOKEN;
        case "token1":
          return WETH_BASE;
        case "getReserves":
          return [parseUnits("2000000", 18), parseUnits("2", 18), 0] as const;
        case "totalSupply":
          return parseUnits("2000", 18);
        case "slot0":
          return [POOL_SQRT_PRICE_X96, 0, 0, 0, 0, 0, true] as const;
        case "liquidity":
          return 500_000_000_000_000_000n;
        case "balanceOf":
          return 0n;
        default:
          return 0n;
      }
    });
  });

  it("loads public Base V2/V3 pool state when disconnected and does not falsely mark Step 1 Completed", async () => {
    render(
      <MemoryRouter>
        <V2ToV3MigrationWizard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/V3 Pool Live/i).length).toBeGreaterThan(0);
    });

    // Disconnected users should never be told Step 1 is already Completed
    expect(screen.queryByText("Completed")).toBeNull();
    expect(screen.getByRole("button", { name: /Connect Wallet to Supply V3/i })).toBeTruthy();
  });

  it("auto-calculates the matching WETH deposit from live V3 slot0 sqrtPriceX96", async () => {
    render(
      <MemoryRouter>
        <V2ToV3MigrationWizard />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Ratio Auto-Synced/i)).toBeTruthy();
    });

    const tokenInput = screen.getByLabelText(/SD to deposit/i) as HTMLInputElement;
    const wethInput = screen.getByLabelText(/WETH \/ ETH to deposit/i) as HTMLInputElement;

    fireEvent.change(tokenInput, { target: { value: "500000" } });

    // 500,000 SD at 1,000,000 SD / 1 WETH => ~0.5 WETH
    expect(Number(wethInput.value)).toBeCloseTo(0.5, 4);
  });

  it("supports V3-native MRWD / WETH pair without calling V2 pair contracts", async () => {
    render(
      <MemoryRouter>
        <V2ToV3MigrationWizard externalPairId="mrwd-weth" />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/V3-Native Pair/i)).toBeTruthy();
    });
    expect(screen.getByRole("link", { name: /Q1 \$MRWD Staking Pool/i }).getAttribute("href")).toBe(
      "/stake"
    );
    expect(
      mocks.readContract.mock.calls.some(([req]) => req?.functionName === "getReserves")
    ).toBe(false);
  });
});
