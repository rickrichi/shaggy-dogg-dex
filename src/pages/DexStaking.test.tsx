import { screen } from "@testing-library/react";
import { vi } from "vitest";

import {
  BASE_DEX_VENUES,
  MRWD_ADDRESS,
  MRWD_UNISWAP_V3_POOL,
} from "@/config/dex-venues";
import { render } from "@/test/utils";

import DexStaking, {
  isCanonicalMrwdSelection,
  isValidImportedTokenMetadata,
  reconcileSelectedTokenId,
} from "./DexStaking";

vi.mock("@/components/MrwdLpStakerPanel", () => ({
  MrwdLpStakerPanel: () => <div data-testid="live-staker-controls" />,
}));

describe("DexStaking", () => {
  it("shows a recovery state while disconnected and never mounts transaction controls", () => {
    render(<DexStaking />);
    expect(
      screen.getByRole("heading", { name: "Connect your wallet" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("live-staker-controls"),
    ).not.toBeInTheDocument();
  });

  it("keeps the canonical Base capability list dynamic and ordered", () => {
    expect(BASE_DEX_VENUES).toHaveLength(8);
    expect(BASE_DEX_VENUES.map((venue) => venue.name)).toEqual([
      "Uniswap V3",
      "Uniswap V2",
      "Aerodrome",
      "PancakeSwap V3",
      "SushiSwap V3",
      "PancakeSwap V2",
      "SushiSwap V2",
      "BaseSwap",
    ]);
  });

  it("drops a stale account selection and chooses the first holding of the new account", () => {
    expect(
      reconcileSelectedTokenId("erc20:old-wallet-token", [
        "native:eth",
        "erc20:new-token",
      ]),
    ).toBe("native:eth");
    expect(
      reconcileSelectedTokenId("erc20:new-token", [
        "native:eth",
        "erc20:new-token",
      ]),
    ).toBe("erc20:new-token");
  });

  it("rejects malformed import metadata before adding it to wallet-scoped holdings", () => {
    expect(isValidImportedTokenMetadata("", "Token", 18)).toBe(false);
    expect(isValidImportedTokenMetadata("X".repeat(25), "Token", 18)).toBe(
      false,
    );
    expect(isValidImportedTokenMetadata("TOK", "Token", 37)).toBe(false);
    expect(isValidImportedTokenMetadata("TOK", "Portfolio Token", 18)).toBe(
      true,
    );
  });

  it("gates staker controls to the exact MRWD, venue, and canonical pool tuple", () => {
    expect(
      isCanonicalMrwdSelection(MRWD_ADDRESS, "Uniswap V3", [
        MRWD_UNISWAP_V3_POOL,
      ]),
    ).toBe(true);
    expect(
      isCanonicalMrwdSelection(MRWD_ADDRESS, "Aerodrome", [
        MRWD_UNISWAP_V3_POOL,
      ]),
    ).toBe(false);
    expect(
      isCanonicalMrwdSelection(MRWD_ADDRESS, "Uniswap V3", [
        "0x1111111111111111111111111111111111111111",
      ]),
    ).toBe(false);
  });
});
