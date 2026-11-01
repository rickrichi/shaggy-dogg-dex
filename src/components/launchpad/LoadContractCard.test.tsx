import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoadContractError } from "@/lib/launchpad/loadContract";

import { LoadContractCard } from "./LoadContractCard";

const OWNER = "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98";
const VAULT = "0x1111111111111111111111111111111111111111";
const STAKING = "0x2222222222222222222222222222222222222222";

const mocks = vi.hoisted(() => ({
  account: { address: "" as string | undefined },
  load: vi.fn(),
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  usePublicClient: () => ({}),
}));
vi.mock("@/lib/launchpad/loadContract", async (original) => ({
  ...(await original<typeof import("@/lib/launchpad/loadContract")>()),
  loadManagedContract: mocks.load,
}));
vi.mock("./LaunchedVaultPanel", () => ({
  LaunchedVaultPanel: ({ label }: { label: string }) => <div>vault panel: {label}</div>,
}));
vi.mock("./FlashRouterPanel", () => ({
  FlashRouterPanel: () => <div>router panel</div>,
}));
vi.mock("./StakingFeesPanel", () => ({
  StakingFeesPanel: ({ tokenSymbol }: { tokenSymbol: string }) => (
    <div>staking panel: {tokenSymbol}</div>
  ),
}));

const paste = (value: string) => {
  fireEvent.change(screen.getByLabelText("Contract address"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Load" }));
};

describe("LoadContractCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = { address: OWNER };
    mocks.load.mockResolvedValue({ kind: "vault", address: VAULT, label: "Aave v3 vault" });
  });

  it("asks for a wallet before offering the box", () => {
    mocks.account = { address: undefined };
    render(<LoadContractCard />);
    expect(screen.getByText(/Connect your wallet/)).toBeTruthy();
    expect(screen.queryByLabelText("Contract address")).toBeNull();
  });

  it("rejects an invalid address without reading the chain", () => {
    render(<LoadContractCard />);
    paste("not-an-address");
    expect(screen.getByRole("alert").textContent).toContain("valid Base contract address");
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("shows a verified vault's panel", async () => {
    render(<LoadContractCard />);
    paste(VAULT);
    expect(await screen.findByText("vault panel: Aave v3 vault")).toBeTruthy();
    expect(mocks.load.mock.calls[0]![2]).toBe(OWNER);
  });

  it("shows a verified staking contract's panel", async () => {
    mocks.load.mockResolvedValue({ kind: "staking", address: STAKING, tokenSymbol: "VLT" });
    render(<LoadContractCard />);
    paste(STAKING);
    expect(await screen.findByText("staking panel: VLT")).toBeTruthy();
  });

  it("shows a verified router's panel", async () => {
    mocks.load.mockResolvedValue({ kind: "router", address: VAULT });
    render(<LoadContractCard />);
    paste(VAULT);
    expect(await screen.findByText("router panel")).toBeTruthy();
  });

  it("shows the reason for a refusal and no panel", async () => {
    mocks.load.mockRejectedValue(
      new LoadContractError("The connected wallet isn't this contract's admin.")
    );
    render(<LoadContractCard />);
    paste(VAULT);
    expect((await screen.findByRole("alert")).textContent).toContain("isn't this contract's admin");
    expect(screen.queryByText(/vault panel/)).toBeNull();
  });

  it("does not present a failed read as a refusal", async () => {
    mocks.load.mockRejectedValue(new Error("rpc down"));
    render(<LoadContractCard />);
    paste(VAULT);
    expect((await screen.findByRole("alert")).textContent).toContain("Could not read");
  });

  it("does not load the same contract twice", async () => {
    render(<LoadContractCard />);
    paste(VAULT);
    await screen.findByText("vault panel: Aave v3 vault");
    paste(VAULT);
    expect(screen.getByRole("alert").textContent).toContain("already loaded");
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("clears loaded contracts when the wallet changes", async () => {
    const view = render(<LoadContractCard />);
    paste(VAULT);
    await screen.findByText("vault panel: Aave v3 vault");
    mocks.account = { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" };
    view.rerender(<LoadContractCard />);
    await waitFor(() => expect(screen.queryByText(/vault panel/)).toBeNull());
  });
});
