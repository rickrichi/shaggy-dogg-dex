import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Launchpad from "./Launchpad";

const mocks = vi.hoisted(() => ({ info: vi.fn() }));

vi.mock("sonner", () => ({ toast: { info: mocks.info, error: vi.fn(), success: vi.fn() } }));
vi.mock("wagmi", () => ({
  useAccount: () => ({
    address: undefined,
    isConnected: false,
    chainId: undefined,
    chain: undefined,
  }),
  useWalletClient: () => ({ data: undefined }),
  usePublicClient: () => undefined,
  useReadContract: () => ({ data: undefined }),
  useSwitchChain: () => ({ switchChain: vi.fn(), isPending: false }),
}));
vi.mock("@/components/WalletConnect", () => ({ WalletConnect: () => null }));
vi.mock("@/components/launchpad/LaunchpadNav", () => ({ LaunchpadNav: () => null }));

function CurrentPath() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/launchpad/:step?"
          element={
            <>
              <Launchpad />
              <CurrentPath />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
const path = () => screen.getByTestId("path").textContent;
const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const fillIdentity = () => {
  fireEvent.change(field("tokenName"), { target: { value: "Probe Token" } });
  fireEvent.change(field("tokenSymbol"), { target: { value: "prb" } });
  fireEvent.change(field("initialSupply"), { target: { value: "1000000" } });
};

describe("launchpad wizard: identity and purpose steps", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.info.mockClear();
  });

  it("moves to purpose with the identity entered and keeps it on the way back", () => {
    open("/launchpad/identity");
    const next = screen.getByRole("button", { name: /Continue to Purpose/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    fillIdentity();
    expect(field("tokenSymbol").value).toBe("PRB");
    fireEvent.click(next);
    expect(path()).toBe("/launchpad/purpose");
    expect(screen.getByRole("tab", { name: /Purpose/ }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(path()).toBe("/launchpad/identity");
    expect(field("tokenName").value).toBe("Probe Token");
    expect(field("initialSupply").value).toBe("1000000");
  });

  it.each(["/launchpad/purpose", "/launchpad/liquidity", "/launchpad/review"])(
    "sends a direct link to %s without a token identity back to step 1",
    (target) => {
      open(target);
      expect(path()).toBe("/launchpad/identity");
      expect(mocks.info).toHaveBeenCalledWith(
        "Start with the token identity: name, ticker and supply."
      );
    }
  );

  it("keeps the wizard through a reload of the purpose step", () => {
    const first = open("/launchpad/identity");
    fillIdentity();
    fireEvent.click(screen.getByRole("button", { name: /Continue to Purpose/ }));
    first.unmount(); // the page is gone; only session storage remains

    open("/launchpad/purpose");
    expect(path()).toBe("/launchpad/purpose");
    expect(mocks.info).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }));
    expect(field("tokenName").value).toBe("Probe Token");
  });
});
