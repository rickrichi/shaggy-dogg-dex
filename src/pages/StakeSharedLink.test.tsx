import { MemoryRouter } from "react-router-dom";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Stake from "./Stake";

vi.mock("@/components/launchpad/LaunchpadNav", () => ({ LaunchpadNav: () => null }));
vi.mock("@/components/MrwdLpStakerPanel", () => ({ MrwdLpStakerPanel: () => null }));
vi.mock("@/components/MrwdProStakingPanel", () => ({ MrwdProStakingPanel: () => null }));
vi.mock("@/components/RouterOperatorPanel", () => ({ RouterOperatorPanel: () => null }));
vi.mock("@/components/YieldVaultPanel", () => ({ YieldVaultPanel: () => null }));
vi.mock("@/components/launchpad/LaunchStakingPanel", () => ({
  LaunchStakingPanel: ({
    stakingAddress,
    variant,
  }: {
    stakingAddress: string;
    variant: string;
  }) => (
    <div>
      staking panel {stakingAddress} ({variant})
    </div>
  ),
}));

const open = (search: string) =>
  render(
    <MemoryRouter initialEntries={[`/stake${search}`]}>
      <Stake />
    </MemoryRouter>
  );

describe("Stake page shared staking link", () => {
  it("opens the launched token's staking panel from ?contract=", () => {
    open("?contract=0x4B834a616F958d69BeAe23Bea27E7781fa28b159");
    expect(screen.getByText("Launched token staking")).toBeTruthy();
    expect(
      screen.getByText("staking panel 0x4B834a616F958d69BeAe23Bea27E7781fa28b159 (page)")
    ).toBeTruthy();
  });

  it("explains a link without a valid address", () => {
    open("?contract=not-an-address");
    expect(screen.getByText("This link does not contain a valid contract address.")).toBeTruthy();
    expect(screen.queryByText(/staking panel/)).toBeNull();
  });

  it("shows nothing extra without a link", () => {
    open("");
    expect(screen.queryByText("Launched token staking")).toBeNull();
  });
});
