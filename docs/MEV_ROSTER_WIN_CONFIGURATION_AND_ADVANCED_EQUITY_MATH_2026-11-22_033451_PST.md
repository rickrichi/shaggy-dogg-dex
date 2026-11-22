# MEV Production Roster Configuration, Base L2 Executor Deployment & Advanced Equity/Bribe-Auction Mathematical Formulation

**Timestamp:** `2026-11-22 03:34:51 PST (UTC-8)`  
**Production Dashboard:** `https://dex.lumsian.com/mev`  
**Production Host:** GCE VM `market-data` (`34.9.52.175`, `us-central1-a`), container `mev-authority` (`aave-mev:mev-authority-7bc333ff2b`)  
**Owner & Beneficiary (`ShaggyDogg`):** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`

---

## 1. Executive Summary

This session upgraded the entire MEV production roster across **Ethereum Mainnet** and **Base Mainnet** (`shaggy-dogg-dex`, `aave-mev`, and `mev-authority`) from passive/blocked paths to a commercial-grade, profit-funded, beneficiary-first execution architecture backed by an exact 10-part mathematical engine for CFMM arbitrage, multi-pool Lagrangian routing, GBM barrier-hitting liquidations, inverse-hazard first-price auction bidding, and HJB jump-diffusion / Bayesian Kelly equity sizing.

### Key Production Milestones Completed
1. **Gold Spoke (Aave V4) Dust Position Filter & Journal Cleanup (`aave-mev` commit `a09387d`):**
   - Diagnosed and eliminated 145 `simFailed` and 57 `liquidatableSeen` false positives caused by a 4-cent dust borrower (`0xeCB9aC0858389Ff69Eb6Fa2dF1199f2636b9Be2C` holding `12` raw `XAUt` = `$0.0429` collateral and `35,688` raw `USDG` = `$0.0357` debt) whose 9-raw-unit swap rounded down and failed Morpho flashloan repayment.
   - Added `hasActionableSpokeDebt()` enforcing `minDebtUsd = $100` (`1e55` ray in `totalDebtValueRay`) in `src/spoke.ts` and `src/main.ts`, and purged the 203 historical dust entries from the live production journal.
2. **Per-Block Scanner V4 Profit-Funded & Quote-Sale Bids (`aave-mev` commit `670b62a`):**
   - Fixed `src/arb/scanner.ts` so the per-block Ethereum arbitrage scanner detects `V2_BRIBE_BPS_SELECTOR` (`1d826759`) and `V4_FUNDED_SELECTOR` (`096a8336`) on `ArbExecutorV4` (`0xa4ee94804d177382429c9cd77214a4d23ceccbdb`) and funds builder bribes directly from WETH trade profit or stablecoin quote-sales (`BID_SALE_POOLS`) instead of reading the contract's `0 ETH` float.
3. **Beneficiary-First `minNetWei` Reservation (`aave-mev` commit `7edd9d0`):**
   - Updated `decide()` in `src/arb/scan.ts`, `referenceArbGate()` in `src/arb/tier1-reference.ts`, and `src/arb/backrun.ts` so that when `surplus >= minNetWei` (`0.00005 ETH`) and the unconstrained `99%` bid fraction would leave less than `minNetWei` for the beneficiary (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`), `bribeWei` is capped at `surplus - minNetWei` instead of rejecting the trade and falling back to `"bribe float too small"`.
   - This immediately unlocked all profitable backruns in the `0.0002 ETH – 0.005 ETH` surplus range while guaranteeing at least `0.00005 ETH` net profit to `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` on every included transaction.
4. **1-Tx MEV-Share Compliance + Multi-Builder Batch & Combined-Arb Fanout (`aave-mev` commit `6f1c8c0`):**
   - Fixed `onOracleHint()` and `combineWithArb()` in `src/main.ts` so MEV-Share (which rejects any bundle with `>1` backrun transaction via `too many txs in bundle`) always receives compliant 1-tx bundles (`backrunBundle(h.hash, signed[0])` plus individual 1-tx bundles for secondary legs and combined DEX arbitrage), while full multi-tx sequences (`signed` and `[...signed, j.signed]`) are simultaneously broadcast to all block builders (`flashbots`, `titan`, `beaverbuild`, `rsync`) via `sendBundleTxs`.
5. **Live Base Mainnet Aave V3 Liquidations Deployed & Activated (`mev-authority` commit `565e070`):**
   - Deployed `AaveL2LiquidationExecutor` on Base Mainnet at [`0xec44ff6fbd65e76a8b5cc27620fe3bce1f0b46f8`](https://basescan.org/address/0xec44ff6fbd65e76a8b5cc27620fe3bce1f0b46f8) (deployment tx `0xcf5d903367c51916d753fa301f7b4002630b98335e5187998d4587d583705fa4`, block `60775987`), wired to Owner & Beneficiary `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` and Operator `0x804E445427A0B867278a838C2d81a93A3A3200Be`.
   - Fixed `src/plugins/aave-l2/main.ts` in `mev-authority` to pass `ctx.env` into `loadLiveSettings(env)` and activated `aave-base` in `mode: "live"` with `POLL_MS=2000`, `MIN_PROFIT_USD=1`, `PRIORITY_MULTIPLIER=3`, and `COLD_INTERVAL=25`.
6. **Multi-RPC Fallback, Zero-429 Liquidator Transport & V4 Profit-Funded Blind Pool-Only Fanout (`aave-mev` commit `6f347da`):**
   - Replaced the rate-limited single-RPC transport on `liquidator` with `viem` `fallback([...])` across `https://ethereum-rpc.publicnode.com`, `https://rpc.mevblocker.io`, and `https://1rpc.io/eth`, updated `ORACLE_RPC_URL` to `https://ethereum-rpc.publicnode.com`, and added automatic `client.getLogs` fallback in `spokeTick()`.
   - Upgraded `planFanout()` in `src/arb/backrun.ts` so `ArbExecutorV4` funds `0.00025 ETH` builder bribes directly out of WETH profit or stablecoin quote-sales (`BID_SALE_POOLS`) on blind pool-only MEV-Share hints (`81%` of all swap hints), and enabled `ARB_BACKRUN_BLIND=1`, `ARB_MAX_CANDIDATES=8`, and `ARB_BASE_SCAN_MS=4000`.
7. **10-Part Advanced Mathematical Engine & Live Dashboard Integration (`aave-mev` commits `ac7de88` & `25de31a`, `shaggy-dogg-dex` commits `2088343`, `81f3eac` & `6bc4206`):**
   - Implemented the full mathematical suite in `src/equity.ts`, unit tests in `test/equity.test.ts`, live telemetry calibration CLI in `scripts/equity-optimizer.ts`, and the interactive `EquityAuctionCard` + `ArbExecutorDeployCard` in `src/pages/MevBot.tsx` and `src/components/ArbExecutorDeployCard.tsx`.

---

## 2. Production Roster Contract & Wallet Architecture

| Role / Instance | Network | Address | Mode / Configuration |
| :--- | :--- | :--- | :--- |
| **Owner & Beneficiary (`ShaggyDogg`)** | Ethereum & Base | `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` | Immutable profit recipient on all executors |
| **Ethereum Liquidator Operator** | Ethereum Mainnet | `0x5BfaE7C19A42889985Ad95DfdA4d89a1f620a360` | Signs Aave V3 & Gold Spoke bundles (`0.0145 ETH` gas) |
| **Arbitrage & Base L2 Operator** | Ethereum & Base | `0x804E445427A0B867278a838C2d81a93A3A3200Be` | Signs Ethereum V4 arb, Base V3 arb, Base Aave V3 liq |
| **`liquidator` (`LiquidationExecutor`)** | Ethereum Mainnet | `0x63bbe715f8c88542428936f271ea5b39720b93f0` | **LIVE** (`PROFIT_FUNDED_BRIBE=true`, `COLD_INTERVAL=40`, `BUNDLE_BLOCKS=5`) |
| **`liquidator` (`SpokeLiquidationExecutor`)** | Ethereum Mainnet | `0xc651761f6a4fa70e6fd5d83bb2845969f00b5888` | **LIVE** (Aave V4 Gold Spoke, `minDebtUsd=$100`) |
| **`arb-ethereum` (`ArbExecutorV4`)** | Ethereum Mainnet | `0xa4ee94804d177382429c9cd77214a4d23ceccbdb` | **LIVE** (WETH & quote-sale profit-funded bribes, `ARB_BACKRUN_BLIND=1`, `ARB_MAX_CANDIDATES=8`) |
| **`arb-base` (`ArbExecutorV3`)** | Base Mainnet | `0x39e0AeA4D34DccAc91909e9EE1579c8568EdD413` | **LIVE** (Profit-funded WETH bribes, `ARB_BASE_SCAN_MS=4000`) |
| **`aave-base` (`AaveL2LiquidationExecutor`)** | Base Mainnet | `0xec44ff6fbd65e76a8b5cc27620fe3bce1f0b46f8` | **LIVE** (`POLL_MS=2000`, `MIN_PROFIT_USD=1`, `PRIORITY_MULTIPLIER=3`, `COLD_INTERVAL=25`) |

---

## 3. Advanced Mathematical Formulation Implemented (`src/equity.ts`)

### 3.1 Exact CFMM Arbitrage (`solveCfmmArbitrage`)
Solves the Angeris et al. convex arbitrage program for a constant-product pool $\varphi(R) = xy = k$ with fee factor $\gamma = 1 - f$ against external price $p_{\text{ext}}$:
$$\max_{\Delta,\Lambda \ge 0}\; \mathbf{p}^\top(\Lambda - \Delta) \quad \text{s.t. } \varphi(R + \gamma\Delta - \Lambda) \ge \varphi(R)$$
- Enforces the exact no-arbitrage band $[\gamma p_{\text{ext}},\, p_{\text{ext}}/\gamma]$ and returns optimal tendered $\Delta^*$, received $\Lambda^*$, and net profit in quote units.

### 3.2 Multi-Pool Lagrangian Split Routing (`solveLagrangianPoolSplit`)
Solves the Lagrangian across parallel constant-product pools $k = 1\dots K$:
$$\mathcal{L} = \sum_{k=1}^K \pi_k(\Delta_k) - \lambda\Big(\sum_{k=1}^K \Delta_k - \Delta_{\text{total}}\Big) \;\Longrightarrow\; \pi_k'(\Delta_k^*) = \lambda \quad \forall k$$
- Equalizes marginal output across all active pools via bisection on the shadow price $\lambda$.

### 3.3 GBM First-Passage Barrier-Hitting Liquidation (`barrierHittingLiquidationProb`)
Models borrower health factor $HF_t = HF_0 P_t / P_0$ under geometric Brownian motion $dP_t = \mu P_t\,dt + \sigma P_t\,dW_t$ with log distance $b = \ln(HF_0)$ and drift $\nu = \mu - \sigma^2/2$:
$$\Pr(\tau \le T) = \Phi\!\Big(\frac{-b - \nu T}{\sigma\sqrt{T}}\Big) + e^{-2\nu b / \sigma^2}\,\Phi\!\Big(\frac{-b + \nu T}{\sigma\sqrt{T}}\Big)$$
- **Live Calibration ($T = 24\text{h}, \sigma = 65\%$):**
  - $HF_0 = 1.01 \implies \Pr(\tau \le 24\text{h}) = 77.4\%$
  - $HF_0 = 1.03 \implies \Pr(\tau \le 24\text{h}) = 39.1\%$
  - $HF_0 = 1.05 \implies \Pr(\tau \le 24\text{h}) = 15.5\%$
  - $HF_0 = 1.10 \implies \Pr(\tau \le 24\text{h}) = 0.5\%$

### 3.4 Marked Poisson Arrivals & Hill Pareto Tail Index (`estimateParetoTailAlpha`)
Estimates the Pareto tail exponent $\Pr(\Pi > x) \sim (x/x_{\min})^{-\alpha}$ over the top order statistics:
$$\hat{\alpha} = \left(\frac{1}{k}\sum_{i=1}^k \ln\frac{\Pi_{(i)}}{\Pi_{(k+1)}}\right)^{-1}$$
- **Live Calibration:** Aave V3 + Gold Spoke liquidation opportunities exhibit $\hat{\alpha} = 0.52 < 2$ (infinite theoretical variance due to multi-ETH jump events), confirming why standard Gaussian Kelly ($\mu/\sigma^2$) overbets and why HJB Jump-Adjusted Kelly is required.

### 3.5 Inverse-Hazard First-Price Auction FOC & Winner's Curse Shading (`fitBribeAuctionCdf`)
Given surplus $V = \Pi - G$ and competitor maximum bid share $S \sim F_S$ with Gaussian KDE density $f_S$, solves both the discrete EV maximum and the continuous inverse-hazard first-order condition with winner's curse shading:
$$(1 - \text{shading}) - s^* = \frac{F_S(s^*)}{f_S(s^*)}, \qquad \beta_{\text{BNE}}(v) = \frac{n_{\text{eff}} - 1}{n_{\text{eff}}}\,v$$
subject to the hard beneficiary floor $V(1 - s^*) \ge \text{minNetEth}$ (`0.00005 ETH`).
- **Live Calibration (SVR Oracle Backruns):**
  - Competitor quantiles: $P_{25} = 90.45\%$, $\text{Median} = 97.83\%$, $P_{75} = 109.42\%$, $P_{90} = 174.73\%$.
  - Standalone overbidders ($s \ge 100\%$): $44.4\%$ (require combined liquidation + DEX arbitrage backrun bundle to monetize).
  - Inverse-Hazard FOC root: $s^*_{\text{IH}} = 90.00\%$ (Bayes-Nash $n_{\text{eff}} = 10 \implies 89.55\%$).

### 3.6 Exponential Latency Race (`latencyRaceWinProbability`)
Models arrival times $T_i \sim \text{Exp}(r_i)$ where $r_i = 1/\text{latencyMs}_i$:
$$P_{\text{first},i} = \frac{r_i}{\sum_j r_j}, \qquad P_{\text{win}} = P_{\text{first},i}\cdot F_B(\beta)$$

### 3.7–3.9 HJB Jump-Diffusion Kelly, Grossman-Zhou Drawdown Cushion, Conjugate Bayesian Kelly & Cramér-Lundberg Ruin (`solveJumpAdjustedKelly`, `computeKellyEquitySizing`)
- **Conjugate Normal-Normal Bayesian Kelly:**
  $$\mu \mid \text{data} \sim \mathcal{N}\!\Big(\frac{\tau^{-2}m_0 + n s^{-2}\bar{x}}{\tau^{-2} + n s^{-2}},\; (\tau^{-2} + n s^{-2})^{-1}\Big), \qquad f^*_{\text{Bayes}} = \frac{\mathbb{E}[\mu \mid \text{data}]}{\sigma^2 + \text{Var}[\mu \mid \text{data}]}$$
- **HJB Jump-Diffusion Kelly FOC:**
  $$\mu_c - f\sigma_c^2 + \lambda\,\mathbb{E}\!\left[\frac{Y}{1 + fY}\right] = 0$$
- **Grossman-Zhou Drawdown-Constrained Cushion:**
  $$f_t^* = f_{\text{jump}}^*\cdot\frac{E_t - \alpha M_t}{E_t}, \qquad M_t = \max_{s \le t} E_s$$
- **Cramér-Lundberg Ruin Exponent $\kappa$ & Rockafellar-Uryasev $\text{CVaR}_{95}$:**
  $$\psi(E) \le e^{-\kappa E}, \qquad \text{CVaR}_{0.95} = \min_\zeta\Big\{\zeta + \frac{1}{0.05\,M}\sum_{m=1}^M (L_m - \zeta)^+\Big\}$$

---

## 4. Commits & Verification Summary

- **`D:\aave-mev` (`origin/master`):**
  - `a09387d` — `fix(spoke): filter out <$100 dust debt positions on Gold Spoke`
  - `670b62a` — `fix(arb): enable profit-funded and V4 quote-sale bids in per-block scanner`
  - `7edd9d0` — `fix(arb): cap bribeWei at surplus - minNetWei so beneficiary floor is always preserved`
  - `ac7de88` — `feat(equity): add empirical bribe-auction CDF F_S(s), Bayes-shrunk Kelly, drawdown & CVaR optimizer`
  - `6f1c8c0` — `fix(oracle): enforce 1-tx mev_sendBundle limit and fan out multi-tx batches to builders`
  - `6f347da` — `feat: add liquidator fallback RPCs, spokeTick log fallback, and V4 profit-funded blind fanout`
  - `25de31a` — `feat: implement CFMM convex arb, Lagrangian pool split, GBM barrier liquidation, inverse-hazard FOC, and HJB jump-Kelly`
- **`D:\mev-authority` (`origin/main`):**
  - `565e070` — `fix(aave-l2): pass ctx.env to loadLiveSettings so per-instance LIVE env works`
- **`D:\shaggy-dogg-dex` (`origin/main`):**
  - `2088343` — `feat(mev): update executor card to V4/V3 profit-funded status and add empirical Kelly/Bribe-CDF panel`
  - `81f3eac` — `fix(mev): remove unused useEffect import in ArbExecutorDeployCard`
  - `6bc4206` — `feat: add inverse-hazard FOC, Bayesian posterior Kelly, and HJB jump-Kelly to EquityAuctionCard`
