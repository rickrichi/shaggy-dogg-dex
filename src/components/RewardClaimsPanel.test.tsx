import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RewardClaimsPanel } from "./RewardClaimsPanel";

import type { RewardDeployment, RewardManifest } from "@/lib/rewards";

// Wallet and chain responses are mocked; real claims are exercised against a local chain
// by the reward end-to-end check described in docs/reward-distribution-runbook.md.
const account = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const other = "0x1111111111111111111111111111111111111111";
const hash = `0x${"ab".repeat(32)}` as const;
const distributor = "0x00000000000000000000000000000000000000D1";

const mocks = vi.hoisted(() => ({
  state: { connected: true, chainId: 8453, liveAddress: "", liveChainId: 8453 },
  load: vi.fn(),
  status: vi.fn(),
  verify: vi.fn(),
  simulate: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  getReceipt: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock("@/lib/reward-claims", () => ({
  loadRewardManifests: mocks.load,
  readRewardStatus: mocks.status,
  verifyRewardDeployment: mocks.verify,
}));
vi.mock("wagmi", () => ({
  useAccount: () => ({ address: account, isConnected: mocks.state.connected, chainId: mocks.state.chainId }),
  useConfig: () => ({}),
  usePublicClient: () => ({
    simulateContract: mocks.simulate,
    waitForTransactionReceipt: mocks.receipt,
    getTransactionReceipt: mocks.getReceipt,
  }),
  useSwitchChain: () => ({ switchChainAsync: mocks.switchChain, isPending: false }),
}));
vi.mock("@wagmi/core", () => ({
  getAccount: () => ({ isConnected: true, address: mocks.state.liveAddress, chainId: mocks.state.liveChainId }),
  getWalletClient: async () => ({
    getAddresses: async () => [mocks.state.liveAddress],
    getChainId: async () => mocks.state.liveChainId,
    writeContract: mocks.write,
    chain: { id: mocks.state.liveChainId },
  }),
}));

const deployment: RewardDeployment = {
  chainId: 8453,
  distributor,
  rewardToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  deploymentBlock: "1",
  epochOrigin: 1_700_000_000,
  indexUrl: "/rewards/index.json",
};
const manifest: RewardManifest = {
  version: 1,
  chainId: 8453,
  distributor,
  rewardToken: deployment.rewardToken,
  epochId: "3",
  startTimestamp: 1_700_000_000 + 2 * 604_800,
  endTimestamp: 1_700_000_000 + 3 * 604_800,
  root: `0x${"11".repeat(32)}`,
  ledgerHash: `0x${"22".repeat(32)}`,
  allocation: "12500000",
  claims: [{ account, amount: "12500000", proof: [`0x${"33".repeat(32)}`] }],
};
const allocation = manifest.claims[0]!;

function row(overrides: Partial<{ allocation: typeof allocation | undefined; claimed: boolean; valid: boolean }> = {}) {
  return { manifest, allocation, claimed: false, valid: true, ...overrides };
}

function renderPanel(config: RewardDeployment = deployment) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RewardClaimsPanel deployment={config} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
  Object.assign(mocks.state, { connected: true, chainId: 8453, liveAddress: account, liveChainId: 8453 });
  mocks.verify.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue([manifest]);
  mocks.status.mockResolvedValue(row());
  mocks.simulate.mockResolvedValue({ request: { address: distributor, functionName: "claim" } });
  mocks.write.mockResolvedValue(hash);
  mocks.receipt.mockResolvedValue({ status: "success", transactionHash: hash });
  mocks.switchChain.mockResolvedValue(undefined);
});

describe("RewardClaimsPanel", () => {
  it("explains that claims are unavailable before a distributor is deployed", () => {
    renderPanel({ ...deployment, distributor: null, epochOrigin: null });
    expect(screen.getByText(/USDC claims are not available yet/)).toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("asks a disconnected visitor to connect", () => {
    mocks.state.connected = false;
    renderPanel();
    expect(screen.getByText(/Connect your wallet/)).toBeInTheDocument();
  });

  it("shows a load failure instead of claiming there are no rewards", async () => {
    mocks.load.mockRejectedValue(new Error("Reward records could not be loaded. Please try again."));
    renderPanel();
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText(/No weekly allocations/)).not.toBeInTheDocument();
  });

  it("claims once, pays only the connected account, and links the confirmed receipt", async () => {
    let finish!: (value: { status: string; transactionHash: string }) => void;
    mocks.receipt.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderPanel();
    expect(await screen.findByText("12.5")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Claim USDC" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(mocks.simulate).toHaveBeenCalledWith(expect.objectContaining({
      functionName: "claim",
      account,
      args: [3n, account, 12_500_000n, allocation.proof],
    }));
    expect(await screen.findByRole("link", { name: /View submitted transaction/ })).toHaveAttribute(
      "href", `https://basescan.org/tx/${hash}`,
    );

    mocks.status.mockResolvedValue(row({ claimed: true }));
    finish({ status: "success", transactionHash: hash });
    expect(await screen.findByRole("link", { name: /Confirmed receipt/ })).toBeInTheDocument();
    expect(await screen.findByText("Claimed on-chain")).toBeInTheDocument();
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });

  it("reports a reverted claim without marking it successful", async () => {
    mocks.receipt.mockResolvedValue({ status: "reverted", transactionHash: hash });
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Claim USDC" }));
    expect(await screen.findByRole("link", { name: /Reverted receipt/ })).toBeInTheDocument();
    expect(screen.getByText(/do not submit it again/)).toBeInTheDocument();
  });

  it("stops before signing when the wallet account changes", async () => {
    renderPanel();
    const button = await screen.findByRole("button", { name: "Claim USDC" });
    mocks.state.liveAddress = other;
    fireEvent.click(button);
    expect(await screen.findByText(/wallet or network changed/)).toBeInTheDocument();
    expect(mocks.simulate).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("requires the reward network before claiming", async () => {
    mocks.state.chainId = 1;
    renderPanel();
    expect(await screen.findByRole("button", { name: "Claim USDC" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Base" }));
    expect(mocks.switchChain).toHaveBeenCalledWith({ chainId: 8453 });
  });

  it.each([
    ["already claimed", row({ claimed: true }), "Claimed on-chain"],
    ["mismatched with the chain", row({ valid: false }), "Allocation does not match a funded on-chain record. Claims unavailable."],
  ])("disables claiming when %s", async (_, status, text) => {
    mocks.status.mockResolvedValue(status);
    renderPanel();
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Claim/ })).toBeDisabled();
  });

  it("shows no button for a week without an allocation for this wallet", async () => {
    mocks.status.mockResolvedValue(row({ allocation: undefined }));
    renderPanel();
    expect(await screen.findByText(/No allocation for this wallet this week/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Claim/ })).not.toBeInTheDocument();
  });
});
