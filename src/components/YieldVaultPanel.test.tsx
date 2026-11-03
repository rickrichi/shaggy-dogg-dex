import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bufferedGas } from "@/lib/gas";

import { YieldVaultPanel } from "./YieldVaultPanel";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
const STAKING = "0x055BB4eD8d5464C25D71391E940ce53CA30845fC";

const mocks = vi.hoisted(() => ({
  estimate: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/components/VaultDeploymentPanel", () => ({ VaultDeploymentPanel: () => null }));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: OWNER, chainId: 8453 }),
  usePublicClient: () => ({
    multicall: () => Promise.resolve([USDC, POOL, STAKING, 100n, 100n, 40n, 1000]),
    readContract: mocks.read,
    simulateContract: mocks.simulate,
    estimateContractGas: mocks.estimate,
    waitForTransactionReceipt: mocks.receipt,
  }),
  useWalletClient: () => ({
    data: {
      getChainId: () => Promise.resolve(8453),
      getAddresses: () => Promise.resolve([OWNER]),
      writeContract: mocks.write,
    },
  }),
}));

const renderPanel = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <YieldVaultPanel />
    </QueryClientProvider>
  );

describe("YieldVaultPanel gas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockImplementation(({ functionName }: { functionName: string }) =>
      Promise.resolve(functionName === "discountDenominator" ? 10_000n : 40n)
    );
    mocks.estimate.mockResolvedValue(283_204n);
    mocks.simulate.mockResolvedValue({ request: { functionName: "withdraw" } });
    mocks.write.mockResolvedValue("0x01");
    mocks.receipt.mockResolvedValue({ status: "success" });
  });

  it("raises a limit that reverted at the bare estimate on a fork", () => {
    expect(bufferedGas(283_204n)).toBe(424_806n);
    expect(bufferedGas(283_204n)).toBeGreaterThan(339_844n); // The limit proven to succeed.
  });

  it("sends vault withdrawals with the buffered limit", async () => {
    renderPanel();
    const button = await screen.findByRole("button", { name: "Withdraw all shares" });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(mocks.write.mock.calls[0]![0].gas).toBe(424_806n);
  });
});
