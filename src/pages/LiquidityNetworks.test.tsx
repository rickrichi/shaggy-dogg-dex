import { MemoryRouter } from "react-router-dom";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Liquidity from "./Liquidity";

const mocks = vi.hoisted(() => ({
  account: {
    address: "0x00000000000000000000000000000000c0ffee01" as string | undefined,
    chainId: 1 as number | undefined,
    isConnected: true,
    chain: { name: "Ethereum" } as { name: string } | undefined,
  },
}));

vi.mock("wagmi", () => ({
  useAccount: () => mocks.account,
  useBalance: () => ({ data: undefined, refetch: vi.fn() }),
  usePublicClient: () => undefined,
  useReadContract: () => ({ data: undefined, refetch: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
  useWriteContract: () => ({ writeContractAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/components/liquidity/V2ToV3MigrationWizard", () => ({
  V2ToV3MigrationWizard: () => <div>migration wizard</div>,
}));
vi.mock("@/components/liquidity/V3LiquidityManager", () => ({
  V3LiquidityManager: () => <div>v3 manager</div>,
}));
vi.mock("@/components/liquidity/LpLockCard", () => ({ LpLockCard: () => <div>lp lock</div> }));

const open = (search = "") => {
  window.history.replaceState(null, "", `/liquidity${search}`);
  return render(
    <MemoryRouter>
      <Liquidity />
    </MemoryRouter>
  );
};
const onNetwork = (chainId: number, name: string) => {
  mocks.account = { ...mocks.account, chainId, chain: { name } };
};
const tab = (name: RegExp) => screen.getByRole("tab", { name }).getAttribute("aria-selected");

describe("Liquidity page by network", () => {
  beforeEach(() => onNetwork(1, "Ethereum"));

  it("opens on classic V2 on Ethereum and does not tell the user to leave", () => {
    open();
    expect(tab(/Uniswap V2/)).toBe("true");
    expect(screen.queryByText("Switch network")).toBeNull();
    expect(screen.queryByText(/Switch to Base Mainnet/)).toBeNull();
    // The LP lock below is Base-only, and says so with what works here.
    expect(screen.getByText("Base only")).toBeTruthy();
    expect(screen.getByText(/Classic V2 add and remove liquidity works here/)).toBeTruthy();
  });

  it("labels the migration and V3 views Base-only on Ethereum when a link opens them", () => {
    open("?version=migrate");
    expect(tab(/Migration/)).toBe("true");
    expect(screen.getByText("Base only")).toBeTruthy();
    expect(screen.getByText("migration wizard")).toBeTruthy();
  });

  it("shows no Base-only notice on Base and opens the default migration view", () => {
    onNetwork(8453, "Base");
    open();
    expect(tab(/Migration/)).toBe("true");
    expect(screen.queryByText("Base only")).toBeNull();
  });

  it("asks a wallet on an unsupported network to switch for classic V2", () => {
    onNetwork(137, "Polygon");
    open("?version=v2");
    expect(screen.getByText("Switch network")).toBeTruthy();
    expect(screen.getByText(/works on Base and Ethereum/)).toBeTruthy();
  });
});
