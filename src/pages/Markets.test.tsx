import { BrowserRouter } from "react-router-dom";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Markets from "./Markets";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 10);
  }

  send = vi.fn();
  close = vi.fn(() => {
    if (this.onclose) this.onclose();
  });
}

(globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket =
  MockWebSocket as unknown as typeof WebSocket;

describe("Markets Page - Live Exchange Streaming", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    MockWebSocket.instances = [];
    vi.clearAllMocks();
  });

  it("renders Markets page and initiates WebSocket connection to Coinbase", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      </QueryClientProvider>
    );

    expect(screen.getByRole("heading", { name: /^Markets$/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Live crypto prices and 24h statistics streamed directly/i)
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search BTC, ETH, SD-USD…/i)).toBeInTheDocument();

    // Verify WebSocket subscription message was sent
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    const ws = MockWebSocket.instances[0];
    if (!ws) throw new Error("Expected a market websocket");
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"channels":["ticker"]'));
  });

  it("updates market rows and live tickers when ticker message arrives", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Markets />
        </BrowserRouter>
      </QueryClientProvider>
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    const ws = MockWebSocket.instances[0];
    if (!ws) throw new Error("Expected a market websocket");

    // Simulate incoming ticker messages
    await act(async () => {
      if (ws.onmessage) {
        ws.onmessage({
          data: JSON.stringify({
            type: "ticker",
            product_id: "BTC-USD",
            price: "85123.45",
            open_24h: "84000.00",
            volume_24h: "1500.5",
            low_24h: "83500.00",
            high_24h: "85500.00",
            best_bid: "85123.00",
            best_ask: "85124.00",
            time: new Date().toISOString(),
          }),
        });

        ws.onmessage({
          data: JSON.stringify({
            type: "ticker",
            product_id: "ETH-USD",
            price: "2500.00",
            open_24h: "2450.00",
            volume_24h: "10000.0",
            low_24h: "2440.00",
            high_24h: "2520.00",
            best_bid: "2499.50",
            best_ask: "2500.50",
            time: new Date().toISOString(),
          }),
        });
      }
    });

    // Check that BTC-USD, ETH-USD, and SD-USD appear in the UI
    expect(screen.getAllByText("BTC-USD").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ETH-USD").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("SD-USD").length).toBeGreaterThanOrEqual(1); // Base synthetic derived from ETH
    expect(screen.getByText(/live ticks streaming/i)).toBeInTheDocument();
  });
});
