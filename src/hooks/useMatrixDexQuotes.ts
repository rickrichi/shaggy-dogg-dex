import { useEffect, useState } from "react";

import { fetchMatrixDexQuotes } from "@/lib/amm/matrix-quotes";

import type { MatrixDexQuote } from "@/lib/amm/matrix-quotes";

export function useMatrixDexQuotes(symbols: readonly string[]) {
  const [quotes, setQuotes] = useState<Record<string, MatrixDexQuote>>({});
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const next = await fetchMatrixDexQuotes(symbols);
      if (disposed) return;
      setQuotes(next);
      timer = setTimeout(() => void poll(), 15_000);
    };
    void poll();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [symbols]);
  return { quotes, now };
}
