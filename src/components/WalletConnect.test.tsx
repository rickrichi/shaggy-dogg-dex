import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WalletConnect } from "./WalletConnect";

const wallet = vi.hoisted(() => ({
  connect: vi.fn(),
  connectors: [] as Array<{
    id: string;
    name: string;
    type: string;
    getProvider: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock("wagmi", () => ({
  useAccount: () => ({ isConnected: false }),
  useBalance: () => ({}),
  useConnect: () => ({ ...wallet, isPending: false }),
  useDisconnect: () => ({ disconnect: vi.fn() }),
  useSwitchChain: () => ({ switchChain: vi.fn() }),
}));

const connector = (id: string, provider: unknown, type = "injected") => ({
  id,
  name: id === "injected" ? "Injected" : "MetaMask",
  type,
  getProvider: vi.fn().mockResolvedValue(provider),
});

async function selectMetaMask() {
  const user = userEvent.setup();
  render(<WalletConnect />);
  await user.click(screen.getByRole("button", { name: "Connect Wallet" }));
  await user.click(screen.getByRole("button", { name: /MetaMask Browser Extension/ }));
}

describe("MetaMask extension connection", () => {
  beforeEach(() => {
    wallet.connectors = [];
  });

  it("uses the announced MetaMask provider even without window.ethereum", async () => {
    const generic = connector("injected", { isCoinbaseWallet: true });
    const legacy = connector("metaMask", undefined);
    const announced = connector("io.metamask", { request: vi.fn() });
    wallet.connectors = [generic, legacy, connector("metaMaskSDK", {}, "metaMask"), announced];

    await selectMetaMask();

    await waitFor(() => {
      expect(wallet.connect).toHaveBeenCalledWith(
        { connector: announced },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
      );
    });
    expect(generic.getProvider).not.toHaveBeenCalled();
  });

  it("uses the targeted legacy MetaMask connector ahead of another wallet", async () => {
    const generic = connector("injected", { isCoinbaseWallet: true });
    const legacy = connector("metaMask", { isMetaMask: true });
    wallet.connectors = [generic, legacy];

    await selectMetaMask();

    await waitFor(() => {
      expect(wallet.connect).toHaveBeenCalledWith({ connector: legacy }, expect.any(Object));
    });
  });

  it("shows browser guidance without reopening the page or connecting another wallet", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    wallet.connectors = [
      connector("injected", { isCoinbaseWallet: true }),
      connector("metaMask", undefined),
      connector("metaMaskSDK", {}, "metaMask"),
    ];

    await selectMetaMask();

    expect(
      await screen.findByText(/MetaMask is not available in this browser window/)
    ).toBeVisible();
    expect(wallet.connect).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Open in Default Browser" })
    ).not.toBeInTheDocument();
  });

  it("shows provider lookup failures and permits another attempt", async () => {
    const legacy = connector("metaMask", undefined);
    legacy.getProvider.mockRejectedValue(new Error("Extension unavailable"));
    wallet.connectors = [legacy];

    await selectMetaMask();

    expect(await screen.findByText("Extension unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: /MetaMask Browser Extension/ })).toBeEnabled();
    expect(wallet.connect).not.toHaveBeenCalled();
  });

  it("displays a rejected connection without closing the wallet picker", async () => {
    wallet.connectors = [connector("metaMask", { isMetaMask: true })];
    wallet.connect.mockImplementation((_args, callbacks) => {
      callbacks.onError(new Error("User rejected the request"));
    });

    await selectMetaMask();

    expect(await screen.findByText("User rejected the request")).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
