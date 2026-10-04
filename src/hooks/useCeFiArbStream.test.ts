import { cleanup, renderHook, waitFor, act } from "@testing-library/react";
import { StrictMode, createElement } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { useCeFiArbStream } from "./useCeFiArbStream";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("does not refetch when an equivalent subscription object is recreated", async () => {
  class Socket {
    static OPEN = 1;
    readyState = 0;
    close() {}
  }
  const fetcher = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      type: "snapshot",
      ts: Date.now(),
      seq: 1,
      notional: 100,
      venues: [],
      opportunities: [],
    }),
  }));
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = renderHook(() =>
    useCeFiArbStream({ notional: 100, minNetBps: 0, symbols: ["ETH/USD"] })
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  rerender();
  rerender();
  expect(fetcher).toHaveBeenCalledOnce();
});

it("opens one socket under StrictMode and lets a pending handshake finish before closing", async () => {
  vi.useFakeTimers();
  const sockets: Socket[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 0;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    send = vi.fn();
    close = vi.fn();
    constructor() {
      sockets.push(this);
    }
  }
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false }))
  );
  const { unmount } = renderHook(() => useCeFiArbStream(), {
    wrapper: ({ children }) => createElement(StrictMode, null, children),
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(sockets).toHaveLength(1);
  const socket = sockets[0]!;
  unmount();
  expect(socket.close).not.toHaveBeenCalled();
  socket.readyState = Socket.OPEN;
  socket.onopen?.();
  expect(socket.close).toHaveBeenCalledOnce();
  expect(socket.send).not.toHaveBeenCalled();
});

it("marks silent open sockets stale and ignores older REST snapshots", async () => {
  vi.useFakeTimers();
  const sockets: Socket[] = [];
  class Socket {
    static OPEN = 1;
    readyState = 0;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    send() {}
    close() {}
    constructor() {
      sockets.push(this);
    }
  }
  const snapshot = {
    type: "snapshot",
    ts: Date.now(),
    seq: 1,
    notional: 1000,
    venues: [],
    opportunities: [],
  };
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ ...snapshot, ts: snapshot.ts - 1000 }) }))
  );
  const { result } = renderHook(() => useCeFiArbStream());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  act(() => {
    const socket = sockets[0]!;
    socket.readyState = Socket.OPEN;
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify(snapshot) });
  });
  expect(result.current.isLive).toBe(true);
  await act(async () => {
    await result.current.refetchSnapshot();
  });
  expect(result.current.snapshot?.ts).toBe(snapshot.ts);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7500);
  });
  expect(result.current.conn).toBe("open");
  expect(result.current.isLive).toBe(false);
});
