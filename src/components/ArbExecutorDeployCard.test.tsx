import { fireEvent, render, screen } from "@testing-library/react";
import { parseEther } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SHAGGY_DOGG_OWNER } from "@/config/arbExecutorArtifact";

import { ArbExecutorDeployCard } from "./ArbExecutorDeployCard";

const mocks = vi.hoisted(() => ({ account: vi.fn(), balance: vi.fn() }));

vi.mock("wagmi", async () => ({
  WagmiContext: (await import("react")).createContext({}),
  useAccount: mocks.account,
  useBalance: mocks.balance,
  useChainId: () => 1,
  useSwitchChain: () => ({}),
  usePublicClient: () => undefined,
  useSendTransaction: () => ({}),
}));

describe("executor wallet balances", () => {
  beforeEach(() => {
    mocks.account.mockReturnValue({ isConnected: false });
  });

  it("identifies the owner fallback and distinguishes missing balances from zero", () => {
    mocks.balance.mockImplementation(({ chainId }: { chainId: number }) =>
      chainId === 1 ? { isError: true } : {}
    );
    render(<ArbExecutorDeployCard />);
    expect(mocks.balance).toHaveBeenCalledWith({ address: SHAGGY_DOGG_OWNER, chainId: 1 });
    expect(screen.getByText("ShaggyDogg wallet: Loading… (Base) · Unavailable (L1)")).toBeVisible();
    expect(screen.queryByRole("link", { name: /bridge/i })).toBeNull();
  });

  it("uses the connected account and only offers the bridge for the Ethereum selection", () => {
    const address = "0x0000000000000000000000000000000000000001";
    mocks.account.mockReturnValue({ isConnected: true, address });
    mocks.balance.mockImplementation(({ chainId }: { chainId: number }) => ({
      data: { value: chainId === 1 ? 0n : parseEther("0.002") },
      isSuccess: true,
    }));
    render(<ArbExecutorDeployCard />);
    expect(mocks.balance).toHaveBeenCalledWith({ address, chainId: 8453 });
    expect(screen.getByText("Connected wallet: 0.0020 ETH (Base) · 0.0000 ETH (L1)")).toBeVisible();
    const bridge = screen.getByRole("link", { name: /bridge/i });
    expect(bridge.getAttribute("href")).not.toContain("amount=");
    fireEvent.click(screen.getByRole("button", { name: /Base Mainnet/ }));
    expect(screen.queryByRole("link", { name: /bridge/i })).toBeNull();
  });

  it("copies the shared configuration and clears success if a later copy fails", async () => {
    mocks.balance.mockReturnValue({});
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Clipboard denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { container } = render(<ArbExecutorDeployCard />);
    fireEvent.click(screen.getByRole("button", { name: /Base Mainnet/ }));
    fireEvent.click(screen.getByRole("button", { name: "Copy Config" }));
    const copied = await screen.findByRole("button", { name: "Copied!" });
    expect(writeText).toHaveBeenCalledWith(container.querySelector("pre")?.textContent);
    fireEvent.click(copied);
    expect(await screen.findByRole("status")).toHaveTextContent("Copy failed");
    expect(screen.getByRole("button", { name: "Copy Config" })).toBeVisible();
  });
});
