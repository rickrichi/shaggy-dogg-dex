import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { METAMASK_DESIGNATOR } from "@/lib/paymaster/accounts";
import {
  BASE_ENTRYPOINT_V08,
  type PaymasterStatus,
  readPaymasterStatus,
  SPONSORED_REWARD_PAYMASTER_ON_BASE,
} from "@/lib/paymaster/client";

import { PaymasterPortfolioTransfer } from "./PaymasterPortfolioTransfer";

const account = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const wallet = vi.hoisted(() => ({ deployContract: vi.fn(), writeContract: vi.fn() }));
vi.mock("wagmi", () => {
  const client = { getBytecode: async () => METAMASK_DESIGNATOR };
  return {
    useAccount: () => ({ address: account, chainId: 8453, isConnected: true }),
    usePublicClient: () => client,
    useWalletClient: () => ({ data: wallet }),
    useSwitchChain: () => ({}),
  };
});
vi.mock("@/hooks/usePortfolio", () => ({ usePortfolio: () => ({ tokens: [] }) }));
vi.mock("@/lib/paymaster/client", async (original) => ({
  ...(await original<typeof import("@/lib/paymaster/client")>()),
  readPaymasterStatus: vi.fn(),
}));

const status: PaymasterStatus = {
  pendingOwner: account,
  signer: account,
  rewardToken: account,
  reservedRewards: 0n,
  maxCostPerOp: 1n,
  cooldownSeconds: 0,
  paused: false,
  stake: 0n,
  staked: false,
  unstakeDelaySec: 0,
  withdrawTime: 0,
  address: SPONSORED_REWARD_PAYMASTER_ON_BASE,
  entryPoint: BASE_ENTRYPOINT_V08,
  owner: account,
  deposit: 10n ** 18n,
  availableRewards: 20n,
  rewardAmount: 12n,
  rewardDecimals: 0,
  rewardSymbol: "MRWD",
};
function showPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PaymasterPortfolioTransfer />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => {
  cleanup();

  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("hides migration for a non-owner", async () => {
  vi.mocked(readPaymasterStatus).mockResolvedValue({ ...status, owner: other });
  showPanel();
  await screen.findByText("+12 MRWD / op");
  await screen.findAllByText(/MetaMask Smart Account/);
  expect(screen.queryByRole("button", { name: /Upgrade & Migrate/ })).toBeNull();
});

it("rechecks ownership before asking the wallet to transact", async () => {
  vi.mocked(readPaymasterStatus)
    .mockResolvedValueOnce(status)
    .mockResolvedValue({ ...status, owner: other });
  showPanel();
  fireEvent.click(await screen.findByRole("button", { name: /Upgrade & Migrate/ }));
  await screen.findByText(/paymaster changed/i);
  expect(wallet.writeContract).not.toHaveBeenCalled();
  expect(wallet.deployContract).not.toHaveBeenCalled();
});

it("keeps late status reads from replacing another paymaster's failed reward read", async () => {
  let finish!: (result: PaymasterStatus) => void;
  vi.mocked(readPaymasterStatus)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    )
    .mockRejectedValue(new Error("RPC unavailable"));
  showPanel();
  await screen.findByText("Loading reward…");
  localStorage.setItem("shaggy-sponsored-reward-paymaster-base-8453", other);
  act(() => {
    window.dispatchEvent(new Event("paymaster-address-changed"));
  });
  await screen.findByText("Reward unavailable");
  await act(async () => {
    finish(status);
  });
  await waitFor(() => expect(readPaymasterStatus).toHaveBeenCalledTimes(2));
  expect(screen.queryByText(/\+\d+ MRWD \/ op/)).toBeNull();
});
