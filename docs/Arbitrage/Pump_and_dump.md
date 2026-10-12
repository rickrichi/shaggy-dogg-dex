Token dumps involve creators minting a large token supply cheaply and then pairing a small portion with real cryptocurrency in a liquidity pool. This structure allows them to
  extract value when buyers purchase the token, increasing the pool's real cryptocurrency reserves. Dumps can also result from project abandonment, team conflicts, or a gradual
  "soft rug" exit strategy.
  In crypto, "dumping" means selling a massive amount of tokens all at once to extract real money (ETH, USDC) from the pool.

  The motive comes down to profit or cutting losses. Here is how and why it happens:
  ──────
  ### 1. The Scammer's Motive: Stealing Real Money (The "Rug Pull")

  This is the most common reason in DeFi. The creator manufactures a token out of thin air and dumps it to cash out real crypto from unsuspecting buyers.
  The Step-by-Step Math:

  1. Creation: A creator mints 1,000,000 fake tokens (called XYZ) for almost $0 in gas fees.
  2. Seeding: They deposit 100,000 XYZ + $500 in real USDC into a Uniswap pool to give it an initial price. They keep the other 900,000 XYZ in their personal wallet.
  3. The Hype: They promote the token on Telegram, Discord, or X (Twitter).
  4. Buyers arrive: Unsuspecting traders buy XYZ with their real USDC. Now the pool has $10,000 in real USDC inside it.
  5. The Dump: The creator suddenly sells all 900,000 XYZ tokens from their personal wallet straight into the pool in one click.
  6. The Result:
      • The AMM math pays out the $10,000 of real USDC to the creator.
      • The pool is left with $0 USDC and a mountain of worthless XYZ tokens.
      • The creator made a $9,500 profit, and the buyers are left with tokens they can never sell.

  ──────
  ### 2. The Failed Project Motive: Cutting Losses

  Not every dump is criminal fraud; sometimes a legitimate team simply fails:

  • A developer spends 6 months building a Web3 game or tool.
  • Nobody uses it, trading volume dies, and the project fails to generate revenue.
  • The developer or team members hold team treasury tokens. Before abandoning the project and shutting down the website, they sell whatever tokens they have left into the pool
  to salvage a few hundred or thousand dollars in ETH/USDC.
  ──────
  ### 3. The "Prisoner’s Dilemma" (Insiders Panicking)

  If multiple co-founders or early investors hold tokens and realize a project is sinking:

  • Whoever sells first gets the most USDC out of the pool.
  • Whoever sells second gets pennies.
  • This triggers a race: team members panic-sell before their partners can beat them to the liquidity pool.
  ──────
  ### How this creates the "Abandoned Pools" you saw:

  After the creator or insiders dump everything:

  • 99.9% of the real money (ETH or USDC) is gone.
  • A tiny fraction—$2.63 or $9.25—is left in the pool as dust.
  • The project website shuts down, but the smart contract lives on the blockchain forever.
  • When our DEX router queried that pool years later, it saw that leftover $2.63 dust and calculated a quote against it!

  All tasks for the Uniswap V3 concentrated liquidity upgrade and Liquidity / Deviation Guard are fully completed, tested, and live in production on
  https://dex.lumsian.com/arbitrage/matrix.