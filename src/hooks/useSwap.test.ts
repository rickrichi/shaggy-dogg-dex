import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_ETH, MOCK_USDC } from "@/test/mockData";
import { AllProviders, mockAddress, toWei } from "@/test/utils";

import { useSwap } from "./useSwap";

import type { Token } from "@/config/tokens";

vi.mock("wagmi", async () => {
  const actual = await vi.importActual<typeof import("wagmi")>("wagmi");
  return {
    ...actual,
    useAccount: vi.fn(() => ({ address: mockAddress("1"), isConnected: true, chainId: 1 })),
    useBalance: vi.fn(() => ({
      data: { value: toWei(10), decimals: 18, formatted: "10.0", symbol: "ETH" },
      isLoading: false,
    })),
    usePublicClient: vi.fn(() => undefined),
    useWalletClient: vi.fn(() => ({ data: undefined })),
    useReadContract: vi.fn(() => ({ data: undefined, isLoading: false })),
    useWriteContract: vi.fn(() => ({
      writeContractAsync: vi.fn(),
      data: undefined,
      isPending: false,
      isSuccess: false,
      isError: false,
    })),
    useWaitForTransactionReceipt: vi.fn(() => ({ isSuccess: false, isError: false })),
  };
});

describe("useSwap", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes its public state and quote contract", () => {
    const { result } = renderHook(() => useSwap(MOCK_ETH, MOCK_USDC), { wrapper: AllProviders });

    expect(result.current.state).toMatchObject({
      sellToken: MOCK_ETH,
      buyToken: MOCK_USDC,
      sellAmount: "",
      buyAmount: "",
      slippage: 0.5,
      isQuoteLoading: false,
    });
    expect(result.current.quote.status).toBe("IDLE");
    expect(result.current.swap.canSwap).toBe(false);
  });

  it("updates input and derives output only from router quotes", () => {
    const { result } = renderHook(() => useSwap(MOCK_ETH, MOCK_USDC), { wrapper: AllProviders });
    const dai: Token = {
      kind: "erc20",
      address: mockAddress("2"),
      symbol: "DAI",
      name: "Dai Stablecoin",
      decimals: 18,
      chainId: 1,
    };

    act(() => {
      result.current.actions.setSellToken(dai);
      result.current.actions.setSellAmount("1.5");
      result.current.actions.setBuyAmount("2500");
    });

    expect(result.current.state.sellToken).toEqual(dai);
    expect(result.current.state.sellAmount).toBe("1.5");
    expect(result.current.state.buyAmount).toBe("");
  });

  it("updates slippage and exposes approval state", () => {
    const { result } = renderHook(() => useSwap(MOCK_ETH, MOCK_USDC), { wrapper: AllProviders });

    act(() => result.current.actions.setSlippage(1));

    expect(result.current.state.slippage).toBe(1);
    expect(result.current.approval).toMatchObject({ needed: false, isApproving: false });
    expect(result.current.approval.approve).toEqual(expect.any(Function));
  });

  it("clears amounts when reversing without a valid quote", () => {
    const { result } = renderHook(() => useSwap(MOCK_ETH, MOCK_USDC), { wrapper: AllProviders });

    act(() => {
      result.current.actions.setSellAmount("1");
      result.current.actions.setBuyAmount("2500");
    });
    act(() => result.current.actions.reverseTokens());

    expect(result.current.state.sellToken).toEqual(MOCK_USDC);
    expect(result.current.state.buyToken).toEqual(MOCK_ETH);
    expect(result.current.state.sellAmount).toBe("");
    expect(result.current.state.buyAmount).toBe("");
  });
});
