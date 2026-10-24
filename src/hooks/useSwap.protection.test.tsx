import { type ReactNode } from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { parseEther } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount, useBalance, usePublicClient, useWalletClient } from "wagmi";

import { BASE_MAINNET_TOKENS } from "@/config/tokens";
import { getRoutePriceImpact } from "@/lib/amm/price-impact";
import { quoteSmartRoutes, routeCandidates } from "@/lib/amm/smart-routing";

import { useSwap } from "./useSwap";

vi.mock("wagmi", () => ({
  useAccount: vi.fn(),
  useBalance: vi.fn(),
  usePublicClient: vi.fn(),
  useWalletClient: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn() } }));
vi.mock("@/lib/amm/price-impact", async (original) => ({
  ...(await original<typeof import("@/lib/amm/price-impact")>()),
  getRoutePriceImpact: vi.fn(),
}));
vi.mock("@/lib/amm/smart-routing", async (original) => ({
  ...(await original<typeof import("@/lib/amm/smart-routing")>()),
  quoteSmartRoutes: vi.fn(),
}));

const eth = BASE_MAINNET_TOKENS.find((t) => t.address === "native")!;
const sd = BASE_MAINNET_TOKENS.find((t) => t.symbol === "SD")!;
const account = "0x0000000000000000000000000000000000000001";
const route = routeCandidates(eth, sd).find((r) => r.venue === "Uniswap V2")!;
const output = parseEther("100");
const wallet = {
  getChainId: vi.fn(),
  getAddresses: vi.fn(),
  writeContract: vi.fn(),
};
const client = {
  chain: { id: 8453 },
  getBlockNumber: vi.fn(),
  readContract: vi.fn(),
  simulateContract: vi.fn(),
  waitForTransactionReceipt: vi.fn(),
};

function setup() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSwap(eth, sd), { wrapper });
  act(() => hook.result.current.actions.setSellAmount("0.01"));
  return hook;
}

beforeEach(() => {
  vi.mocked(useAccount).mockReturnValue({
    address: account,
    chainId: 8453,
    isConnected: true,
  } as unknown as ReturnType<typeof useAccount>);
  vi.mocked(useBalance).mockReturnValue({
    data: { value: parseEther("10"), decimals: 18, symbol: "ETH", formatted: "10" },
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useBalance>);
  vi.mocked(useWalletClient).mockReturnValue({ data: wallet } as unknown as ReturnType<
    typeof useWalletClient
  >);
  vi.mocked(usePublicClient).mockReturnValue(
    client as unknown as ReturnType<typeof usePublicClient>
  );
  vi.mocked(quoteSmartRoutes).mockImplementation(async () => ({
    quotes: [{ route, output }],
    best: { route, output },
    blockNumber: 100n,
    observedAt: Date.now(),
  }));
  vi.mocked(getRoutePriceImpact).mockResolvedValue(20);
  wallet.getChainId.mockResolvedValue(8453);
  wallet.getAddresses.mockResolvedValue([account]);
  wallet.writeContract.mockResolvedValue("0x123");
  client.getBlockNumber.mockResolvedValue(101n);
  client.readContract.mockResolvedValue([parseEther("0.01"), output]);
  client.simulateContract.mockResolvedValue({ request: {} });
  client.waitForTransactionReceipt.mockResolvedValue({ status: "success" });
});

describe("swap impact execution guard", () => {
  it("cannot submit a high-impact swap without explicit confirmation", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.swap.canSwap).toBe(true));
    await act(() => result.current.swap.execute());
    expect(wallet.writeContract).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("confirm"), expect.anything());
  });

  it("allows a confirmed trade after rechecking impact at the current quote block", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.swap.canSwap).toBe(true));
    await act(() => result.current.swap.execute(result.current.quote.id));
    expect(wallet.writeContract).toHaveBeenCalledTimes(1);
    expect(getRoutePriceImpact).toHaveBeenLastCalledWith(
      client,
      8453,
      route,
      parseEther("0.01"),
      output,
      101n
    );
  });

  it("invalidates confirmation when slippage changes", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.swap.canSwap).toBe(true));
    const reviewed = result.current.quote.id;
    act(() => result.current.actions.setSlippage(1));
    expect(result.current.quote.id).not.toBe(reviewed);
    await act(() => result.current.swap.execute(reviewed));
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it.each([null, 25])("refuses a confirmed trade when the latest impact is %s", async (impact) => {
    const { result } = setup();
    await waitFor(() => expect(result.current.swap.canSwap).toBe(true));
    vi.mocked(getRoutePriceImpact).mockResolvedValue(impact);
    await act(() => result.current.swap.execute(result.current.quote.id));
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("requires a new review if a low-impact trade becomes high-impact", async () => {
    vi.mocked(getRoutePriceImpact).mockResolvedValue(1);
    const { result } = setup();
    await waitFor(() => expect(result.current.swap.canSwap).toBe(true));
    vi.mocked(getRoutePriceImpact).mockResolvedValue(8);
    await act(() => result.current.swap.execute());
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("disables swapping if impact cannot be calculated", async () => {
    vi.mocked(getRoutePriceImpact).mockResolvedValue(null);
    const { result } = setup();
    await waitFor(() => expect(result.current.quote.status).toBe("SUCCESS"));
    expect(result.current.quote.priceImpact).toBeNull();
    expect(result.current.swap.canSwap).toBe(false);
    await act(() => result.current.swap.execute());
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });

  it("rechecks quote expiry at execution even before the UI timer ticks", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.swap.canSwap).toBe(true));
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 31_000);
    await act(() => result.current.swap.execute(result.current.quote.id));
    expect(wallet.writeContract).not.toHaveBeenCalled();
  });
});
