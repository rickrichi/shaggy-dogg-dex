import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { V4 } from "@/lib/amm/uniswap-v4";
import { getSqrtPriceAtTick } from "@/lib/amm/v4-math";

import UniswapV4, { parseAmount } from "./UniswapV4";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  simulate: vi.fn(),
  switchChain: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ address: OWNER, chainId: 8453 }),
  useSwitchChain: () => ({ switchChainAsync: mocks.switchChain }),
  useWriteContract: () => ({ writeContractAsync: mocks.write }),
  usePublicClient: () => ({
    getBalance: () => Promise.resolve(10n ** 18n),
    getBlockNumber: () => Promise.resolve(100n),
    getLogs: () => Promise.resolve([]),
    readContract: () => Promise.resolve(0n),
    // StateView reads go through multicall: one live 0.3% pool, the rest empty.
    multicall: ({ contracts }: { contracts: Array<{ functionName: string; args: [string] }> }) =>
      Promise.resolve(
        contracts.map((c, i) => {
          const live = Math.floor(i / 2) === 2;
          if (c.functionName === "getSlot0")
            return {
              status: "success",
              result: live ? [getSqrtPriceAtTick(-199213), -199213, 0, 3000] : [0n, 0, 0, 0],
            };
          return { status: "success", result: live ? 10n ** 18n : 0n };
        })
      ),
    simulateContract: mocks.simulate,
    waitForTransactionReceipt: () => Promise.resolve({ status: "success" }),
  }),
}));
vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess, message: vi.fn() },
}));

const renderPage = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <UniswapV4 />
    </QueryClientProvider>
  );

describe("Uniswap v4 page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.simulate.mockImplementation(({ functionName }: { functionName: string }) =>
      Promise.resolve(
        functionName.startsWith("quote")
          ? { result: [22_000_000n, 100_000n] }
          : { result: undefined }
      )
    );
    mocks.write.mockResolvedValue("0xabc");
  });

  it("parses pasted amounts", () => {
    expect(parseAmount(" 0.01 ETH ", 18)).toBe(10n ** 16n);
    expect(parseAmount("0,5", 6)).toBe(500_000n);
    expect(() => parseAmount("1.2.3", 6)).toThrow();
  });

  it("quotes ETH -> USDC and swaps through Universal Router 2.1.2 after simulating", async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("Amount of ETH"), { target: { value: "0.01" } });
    expect(await screen.findByText(/22 USDC/)).toBeTruthy();
    expect(screen.getByText(/direct, 0.3% pool/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    const call = mocks.write.mock.calls[0]![0];
    expect(call).toMatchObject({
      address: V4[8453].universalRouter,
      functionName: "execute",
      chainId: 8453,
      value: 10n ** 16n,
    });
    // Minimum out is the quote less the default 0.5% slippage, encoded as TAKE_ALL's minimum.
    expect(
      mocks.simulate.mock.calls.some(([c]) => c.functionName === "execute" && c.account === OWNER)
    ).toBe(true);
    expect(mocks.switchChain).not.toHaveBeenCalled();
  });

  it("switches the wallet to Ethereum before an Ethereum swap", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Ethereum" }));
    fireEvent.change(screen.getByPlaceholderText("Amount of ETH"), { target: { value: "0.01" } });
    await screen.findByText(/22 USDC/);
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.switchChain).toHaveBeenCalledWith({ chainId: 1 });
    expect(mocks.write.mock.calls[0]![0]).toMatchObject({
      address: V4[1].universalRouter,
      chainId: 1,
    });
  });

  it("does not sign when the simulation fails", async () => {
    mocks.simulate.mockImplementation(({ functionName }: { functionName: string }) =>
      functionName.startsWith("quote")
        ? Promise.resolve({ result: [22_000_000n, 1n] })
        : Promise.reject(new Error("V4TooLittleReceived"))
    );
    renderPage();
    fireEvent.change(screen.getByPlaceholderText("Amount of ETH"), { target: { value: "0.01" } });
    await screen.findByText(/22 USDC/);
    fireEvent.click(screen.getByRole("button", { name: "Swap" }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
