  Let's get you liquified! 🌊

  When you add liquidity to an Automated Market Maker (AMM) pool, you deposit two tokens simultaneously (e.g. ETH + SD, or ETH +
  MRWD) into the Uniswap smart contract. In exchange, the pool mints LP positions directly to your wallet,
  which earn a share of swap fees generated on the DEX.
  ──────
  ### Your Live Balances & Pools on Base Mainnet

  Your connected wallet (0x9dC0...7C98) has:

  • ETH: 0.01025 ETH (~$25.70)
  • SD (Shaggy Dogg): 499,999.99 SD
  • MRWD (Mutt Rewards): 0xC17227AAa33C54634B6cE7AD0bf33A156563c179

  #### Current Live Pool Reserves:

  1. SD / ETH Pool (0xc3d1e0b1cd05081bd7af4cf87f681512e3e90917):
      • Current Ratio: ~98,800 SD per 0.0001 ETH
  2. MRWD / WETH 0.30% V3 Pool (0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5):
      • Canonical Uniswap V3 pool on Base

  ──────
  ### Step-by-Step: How to Add Liquidity

  #### Option A: Direct via Web App (Recommended)

  1. Open https://dex.lumsian.com/liquidity.
  2. Ensure MetaMask is connected to Base.
  3. Select your pair:
      • Token A: ETH
      • Token B: SD (or MRWD)
  4. Type in a small amount of ETH to seed—for example:
      • 0.0001 ETH (about $0.25 USD).
      • The DEX will automatically calculate the matching proportional token amount (e.g., ~98,800 SD).
  5. Approve Token:
      • If it's your first time supplying this token, click "Approve SD". MetaMask will ask you to approve the Uniswap V2 Router
      (0x4752...aD24). Confirm it.
  6. Supply Liquidity:
      • Click "Add Liquidity".
      • MetaMask will pop up the transaction (addLiquidityETH). Confirm it.
  7. Done!
      • The transaction settles on Base in ~2 seconds.
      • Your pool share percentage and LP balance will appear right in the Pool Overview box at the bottom of the page!

  ──────
  #### Option B: Programmatically via Script

  If you prefer to run it directly from your terminal using a script (similar to add-fba-liquidity.ts), let me know which pair
  (SD/ETH or MRWD/ETH) and how much ETH you'd like to supply, and I can run a simulation and broadcast it for you!

  The latest liquidity update is live on https://dex.lumsian.com/liquidity! 🚀

  Which pool would you like to liquify first?

  1. ETH + SD (Shaggy Dogg)
      • Example: 0.0001 ETH paired with ~98,800 SD
  2. ETH + MRWD (Mutt Rewards)
      • Canonical V3 0.30% pool on Base

  ──────
  ### How to do it right now:

  • In the browser: Head over to https://dex.lumsian.com/liquidity, select your tokens, enter the amount, click Approve, and then
  click Add Liquidity!
  • Or via automated script: If you'd rather have me run a script from the terminal to execute it for you, tell me the pair and
  amount and I'll broadcast the transaction directly!
