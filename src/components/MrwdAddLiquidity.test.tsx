import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { encodeEventTopics, pad } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { positionManagerAbi } from "@/lib/mrwd-liquidity";

import { MrwdAddLiquidity, parseEthAmount } from "./MrwdAddLiquidity";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const NPM = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
const STAKER = "0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1";
const E18 = 10n ** 18n;
// 4e12 MRWD per WETH: sqrt = 2e6, so sqrtPriceX96 = 2e6 << 96.
const SQRT = 2_000_000n << 96n;
const key = {
  rewardToken: "0xC17227AAa33C54634B6cE7AD0bf33A156563c179" as const,
  pool: "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5" as const,
  startTime: 1n,
  endTime: 9_999_999_999n,
  refundee: "0x000000000000000000000000000000000000dEaD" as const,
};

const mocks = vi.hoisted(() => ({
  account: {
    address: "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98" as string | undefined,
    chainId: 8453,
  },
  eth: 0n,
  mrwd: 0n,
  write: vi.fn(),
  simulate: vi.fn(),
  receipt: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({
    getBalance: () => Promise.resolve(mocks.eth),
    readContract: ({ functionName }: { functionName: string }) =>
      Promise.resolve(
        functionName === "slot0"
          ? [SQRT, 0, 0, 0, 0, 0, true]
          : functionName === "balanceOf"
            ? mocks.mrwd
            : 0n
      ),
    simulateContract: mocks.simulate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWriteContract: () => ({ writeContractAsync: mocks.write }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

const mintLog = {
  address: NPM,
  topics: encodeEventTopics({
    abi: positionManagerAbi,
    eventName: "Transfer",
    args: { from: "0x0000000000000000000000000000000000000000", to: OWNER, tokenId: 777n },
  }),
  data: "0x",
  blockNumber: 1n,
  transactionHash: pad("0x01"),
  logIndex: 0,
  blockHash: pad("0x02"),
  transactionIndex: 0,
  removed: false,
};

describe("MrwdAddLiquidity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: OWNER, chainId: 8453 };
    mocks.eth = 5n * 10n ** 15n; // 0.005 ETH
    mocks.mrwd = 130_000_000n * E18;
    // The quoter: a fixed price with no impact, which keeps the split predictable.
    mocks.simulate.mockImplementation(({ functionName, args }) =>
      Promise.resolve(
        functionName === "quoteExactInputSingle"
          ? { result: [(args[0].amountIn as bigint) * 4_000_000_000_000n, SQRT] }
          : { result: [] }
      )
    );
    mocks.write.mockResolvedValue("0xabc");
    mocks.receipt.mockResolvedValue({ status: "success", logs: [mintLog] });
  });

  it("swaps, approves, mints and stakes the new position in the given quarter", async () => {
    render(<MrwdAddLiquidity incentiveKey={key} onDone={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("ETH amount"), { target: { value: "0.004" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(await screen.findByRole("button", { name: /Add & stake/ }));
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Position #777 added and staked.")
    );

    const sent = mocks.write.mock.calls.map(([c]) => c);
    expect(sent.map((c) => c.functionName)).toEqual([
      "multicall",
      "approve",
      "multicall",
      "safeTransferFrom",
    ]);
    expect(sent.every((c) => c.chainId === 8453)).toBe(true);
    // Swap plus liquidity spend the 0.004 ETH asked for, no more.
    expect(sent[0].value + sent[2].value).toBe(4n * 10n ** 15n);
    expect(sent[3].address).toBe(NPM);
    expect(sent[3].args.slice(0, 3)).toEqual([OWNER, STAKER, 777n]);
    // Every send is simulated first.
    expect(
      mocks.simulate.mock.calls.filter(([c]) => c.functionName !== "quoteExactInputSingle")
    ).toHaveLength(4);
  });

  it("refuses an amount that would leave no ETH for gas", async () => {
    render(<MrwdAddLiquidity incentiveKey={key} onDone={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("ETH amount"), { target: { value: "0.0049" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/Keep 0.0004 ETH/))
    );
    expect(screen.queryByRole("button", { name: /Add & stake/ })).toBeNull();
  });

  it("stops at the step that fails and sends nothing after it", async () => {
    mocks.receipt.mockResolvedValueOnce({ status: "reverted", logs: [] });
    render(<MrwdAddLiquidity incentiveKey={key} onDone={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("ETH amount"), { target: { value: "0.004" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(await screen.findByRole("button", { name: /Add & stake/ }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringContaining("still in your wallet"))
    );
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
});

describe("parseEthAmount", () => {
  it("accepts amounts pasted with spaces, a unit, a comma or invisible characters", () => {
    const want = 4_257_000_000_000_000n;
    for (const text of [
      "0.004257",
      " 0.004257 ",
      "0.004257 ETH",
      "0,004257",
      "​0.004257 ",
      ".004257",
    ]) {
      expect(parseEthAmount(text)).toBe(want);
    }
    expect(parseEthAmount("0.004257308522998578123")).toBe(4_257_308_522_998_578n);
  });

  it("rejects text that is not a number", () => {
    expect(() => parseEthAmount("")).toThrow(/as a number/);
    expect(() => parseEthAmount("1.2.3")).toThrow(/as a number/);
  });
});
