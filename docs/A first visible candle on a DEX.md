A "first visible candle" on a DEX chart refers to the initial candlestick displayed when viewing a new trading pair or time period. This candlestick represents the first recorded price action, showing the opening, closing, high, andlow prices for that specific period. It is the beginning point for visual analysis of price movements on the chart.
A "candle" (or candlestick) is the standard rectangular bar used on financial and crypto charts (like TradingView,

DexScreener, and GeckoTerminal) to show price movement over time:

           ▲ High
           │
       ┌───┴───┐
       │       │  ◄ Close
       │ Green │
       │ (Up)  │  ◄ Open
       └───┬───┘
           │
           ▼ Low
  ──────
  ### What does the "First visible candle" mean?

  1. Before any trades occur:
      • A brand-new liquidity pool has no trading history.
      • On charting platforms (DexScreener, GeckoTerminal, or your DEX's chart), the graph is completely blank.
  2. When the first trade happens:
      • Automated indexers detect the swap event on the Base blockchain.
      • The trade establishes the initial Open, High, Low, and Close prices for that minute.
      • The charting tool draws the very first candle on the graph.
  3. Why size matters:
      • Extremely microscopic trades (like 0.0001 SD / fractions of a billionth of a dollar) are often rounded to $0.
      00 or ignored as "dust" by chart scrapers.
      • A trade of 100 or 1,000 SD has enough value to be registered clearly by charting bots, officially printing
      the token's first candle and starting its live price chart!