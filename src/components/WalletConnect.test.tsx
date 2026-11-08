import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMetaMaskDappLink,
  buildMetaMaskWcDeepLink,
  buildMetaMaskWcUniversalLink,
  isUserCancel,
  WalletConnect,
} from "./WalletConnect";

const wallet = vi.hoisted(() => ({
  connect: vi.fn(),
  connectors: [] as Array<{
    id: string;
    name: string;
    type: string;
    getProvider: ReturnType<typeof vi.fn>;
    emitter?: {
      on?: ReturnType<typeof vi.fn>;
      off?: ReturnType<typeof vi.fn>;
    };
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
  name: id === "injected" ? "Injected" : id === "walletConnect" ? "WalletConnect" : "MetaMask",
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
    wallet.connect.mockReset();
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

describe("MetaMask Mobile QR Code & Android login", () => {
  beforeEach(() => {
    wallet.connectors = [];
    wallet.connect.mockReset();
  });

  it("renders the inline QR code when WalletConnect emits display_uri and switches scan modes", async () => {
    const sampleUri = "wc:9f8e7d6c5b4a@2?relay-protocol=irn&symKey=1234567890abcdef";
    const listeners: Record<string, Array<(uri: string) => void>> = {};
    const wcProvider = {
      on: vi.fn((event: string, cb: (uri: string) => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event]?.push(cb);
      }),
      removeListener: vi.fn(),
    };
    const wcConnector = connector("walletConnect", wcProvider, "walletConnect");
    wallet.connectors = [wcConnector];
    wallet.connect.mockImplementation(() => {
      listeners["display_uri"]?.forEach((cb) => cb(sampleUri));
    });

    const user = userEvent.setup();
    render(<WalletConnect />);

    await user.click(screen.getByRole("button", { name: "Connect Wallet" }));
    await user.click(screen.getByRole("button", { name: /MetaMask Mobile \(QR Code\)/ }));

    expect(await screen.findByText("MetaMask Mobile QR Login")).toBeVisible();
    const qrImg = await screen.findByRole("img", { name: "MetaMask Mobile QR Code" });
    expect(qrImg).toBeVisible();
    expect(qrImg.getAttribute("src")).toMatch(/^data:image\/svg\+xml;utf8,/);

    // Pair MetaMask App link should point to the MetaMask universal/deep link
    const pairLink = screen.getByRole("link", { name: /Pair MetaMask App/i });
    expect(pairLink).toHaveAttribute("href", buildMetaMaskWcUniversalLink(sampleUri));

    // Switch to Phone Camera mode and Open Swap on Phone mode
    await user.click(screen.getByRole("tab", { name: "Phone Camera" }));
    expect(
      screen.getByText(/Point your Android phone's native Camera app at this QR code/i)
    ).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Open Swap on Phone" }));
    expect(
      screen.getByText(/open dex\.lumsian\.com\/swap directly inside the MetaMask Mobile browser/i)
    ).toBeVisible();
  });

  it("opens directly to the QR login view when triggered from the /swap page event", async () => {
    const sampleUri = "wc:swap-direct-qr@2?relay-protocol=irn&symKey=abcdef";
    const wcProvider = {
      signer: { uri: sampleUri },
      on: vi.fn(),
      removeListener: vi.fn(),
    };
    const wcConnector = connector("walletConnect", wcProvider, "walletConnect");
    wallet.connectors = [wcConnector];

    render(<WalletConnect />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("shaggy:open-wallet-connect", { detail: { view: "qr" } })
      );
    });

    expect(await screen.findByText("MetaMask Mobile QR Login")).toBeVisible();
    expect(await screen.findByRole("img", { name: "MetaMask Mobile QR Code" })).toBeVisible();
    expect(wallet.connect).toHaveBeenCalledWith({ connector: wcConnector }, expect.any(Object));
  });

  it("formats MetaMask Mobile universal and deep links for Android", () => {
    const uri = "wc:abc@2?relay-protocol=irn&symKey=xyz";
    expect(buildMetaMaskWcUniversalLink(uri)).toBe(
      `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`
    );
    expect(buildMetaMaskWcDeepLink(uri)).toBe(`metamask://wc?uri=${encodeURIComponent(uri)}`);
    expect(buildMetaMaskDappLink()).toMatch(
      /^https:\/\/metamask\.app\.link\/dapp\/dex\.lumsian\.com/
    );
  });
});

describe("WalletConnect cancel detection", () => {
  it("treats a closed WalletConnect window or a declined request as a cancel", () => {
    expect(isUserCancel({ name: "UserRejectedRequestError", message: "x" })).toBe(true);
    expect(isUserCancel({ code: 4001 })).toBe(true);
    expect(
      isUserCancel(new Error("User rejected the request. Details: Connection request reset."))
    ).toBe(true);
    expect(isUserCancel(new Error("Project ID is invalid"))).toBe(false);
    expect(isUserCancel(null)).toBe(false);
  });
});
