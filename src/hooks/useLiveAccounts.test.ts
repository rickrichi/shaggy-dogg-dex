import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLiveAccounts } from "./useLiveAccounts";

class Source {
  static latest: Source;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor() {
    Source.latest = this;
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("live account telemetry", () => {
  it("updates balances from successive events, expires stale data, and closes the stream", () => {
    vi.useFakeTimers();
    vi.stubGlobal("EventSource", Source);
    const { result, unmount } = renderHook(() => useLiveAccounts());
    const update = (cash: number) =>
      act(() =>
        Source.latest.onmessage?.({
          data: JSON.stringify({
            mode: "live",
            accounts: { alpaca: { mode: "live", configured: true, updatedAt: Date.now(), cash } },
          }),
        })
      );
    update(100);
    expect(result.current.alpacaAccount?.cash).toBe(100);
    update(95);
    expect(result.current.alpacaAccount?.cash).toBe(95);
    expect(result.current.alpacaAccount?.configured).toBe(true);
    act(() => vi.advanceTimersByTime(31000));
    expect(result.current.alpacaAccount?.configured).toBe(false);
    unmount();
    expect(Source.latest.close).toHaveBeenCalledOnce();
  });
});
