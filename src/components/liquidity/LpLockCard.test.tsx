import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SOVEREIGN_V3_TIMELOCK_ADDRESS } from "@/config/dex/v3TimelockAbi";

import { LpLockCard } from "./LpLockCard";

// These component tests exercise wallet responses, not a real wallet extension.
// Real signatures and Uniswap settlement are covered by test-v3-timelock-fork.mjs.
const mocks = vi.hoisted(() => ({
  write: vi.fn(), receipt: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn(),
  refetch: vi.fn(),
  data: {} as Record<string, unknown>,
  state: { connected: true, chainId: 8453, approved: false, locked: false, expired: false },
}));
const owner = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const zero = "0x0000000000000000000000000000000000000000";
const hash = `0x${"ab".repeat(32)}`;

vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, info: mocks.info } }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: owner, isConnected: mocks.state.connected, chainId: mocks.state.chainId }),
  usePublicClient: () => ({ waitForTransactionReceipt: mocks.receipt }),
  useWriteContract: () => ({ writeContractAsync: mocks.write }),
  useReadContract: ({ functionName }: { functionName: string }) => ({ data: mocks.data[functionName], refetch: mocks.refetch }),
}));

function renderCard() {
    const unlock = Math.floor(Date.now() / 1000) + (mocks.state.expired ? -10 : 86400);
    mocks.data = {
      ownerOf: mocks.state.locked ? SOVEREIGN_V3_TIMELOCK_ADDRESS : owner,
      getApproved: mocks.state.approved ? SOVEREIGN_V3_TIMELOCK_ADDRESS : zero,
      isApprovedForAll: false,
      getLock: mocks.state.locked ? [owner, BigInt(unlock), 1n, !mocks.state.expired] : [zero, 0n, 0n, false],
      positions: [0n, zero, zero, zero, 10000, -887200, 887200, 1000n, 0n, 0n, 0n, 0n],
    };
    return render(<LpLockCard />);
}

const cases = [
  { action: "approve", button: /1\. Approve Sovereign Locker/, locked: false, expired: false, approved: false },
  { action: "lockPosition", button: /2\. Lock NFT/, locked: false, expired: false, approved: true },
  { action: "harvestTradingFees", button: /Harvest 100% Fees to Wallet/, locked: true, expired: false, approved: true },
  { action: "withdraw", button: /Withdraw Position NFT/, locked: true, expired: true, approved: true },
];

beforeEach(() => {
  Object.assign(mocks.state, { connected: true, chainId: 8453, approved: false, locked: false, expired: false });
  mocks.write.mockResolvedValue(hash);
  mocks.receipt.mockResolvedValue({ status: "success", transactionHash: hash });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Liquidity locker wallet flow", () => {
  for (const scenario of cases) {
    it(`${scenario.action}: waits for a successful receipt before reporting success`, async () => {
      Object.assign(mocks.state, scenario);
      let resolveReceipt!: (receipt: { status: string }) => void;
      mocks.receipt.mockReturnValue(new Promise((resolve) => { resolveReceipt = resolve; }));
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: scenario.button }));
      await waitFor(() => expect(mocks.receipt).toHaveBeenCalledWith({ hash }));
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.write).toHaveBeenCalledWith(expect.objectContaining({ functionName: scenario.action }));
      resolveReceipt({ status: "success" });
      await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1));
      expect(mocks.error).not.toHaveBeenCalled();
    });

    it(`${scenario.action}: handles wallet rejection without reporting success`, async () => {
      Object.assign(mocks.state, scenario);
      mocks.write.mockRejectedValue(Object.assign(new Error("User rejected the request"), { code: 4001 }));
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: scenario.button }));
      await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("User rejected the request"));
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.receipt).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: scenario.button })).toBeEnabled();
    });

    it(`${scenario.action}: must report a mined revert as failure`, async () => {
      Object.assign(mocks.state, scenario);
      mocks.receipt.mockResolvedValue({ status: "reverted", transactionHash: hash });
      renderCard();
      fireEvent.click(screen.getByRole("button", { name: scenario.button }));
      await waitFor(() => expect(mocks.receipt).toHaveBeenCalled());
      await waitFor(() => expect(screen.getByRole("button", { name: scenario.button })).toBeEnabled());
      expect(mocks.success).not.toHaveBeenCalled();
      expect(mocks.error).toHaveBeenCalled();
    });
  }

  it("prevents withdrawal while the countdown is active", () => {
    mocks.state.locked = true;
    renderCard();
    expect(screen.getByRole("button", { name: /Locked Until/ })).toBeDisabled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("disables signing controls when the wallet is disconnected", () => {
    mocks.state.connected = false;
    renderCard();
    expect(screen.getByRole("button", { name: /1\. Approve Sovereign Locker/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /2\. Lock NFT/ })).toBeDisabled();
  });

  it("must block or explicitly target Base when the connected wallet is on Ethereum", async () => {
    mocks.state.chainId = 1;
    renderCard();
    const button = screen.getByRole("button", { name: /1\. Approve Sovereign Locker/ });
    if (button.hasAttribute("disabled")) return;
    fireEvent.click(button);
    await waitFor(() => expect(mocks.write).toHaveBeenCalled());
    expect(mocks.write.mock.calls[0]?.[0]?.chainId).toBe(8453);
  });
});
