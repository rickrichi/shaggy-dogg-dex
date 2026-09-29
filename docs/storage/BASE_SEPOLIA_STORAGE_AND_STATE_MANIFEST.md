# Shaggy Dogg DEX - Base Sepolia Storage & On-Chain State Manifest

**Network:** Base Sepolia (Chain ID: `84532`)  
**Timestamp:** 2026-09-29T02:57:00Z  
**Block Height:** `47453766`  
**Explorer:** [BaseScan Sepolia](https://sepolia.basescan.org)  

---

## 1. Primary Contracts & Storage State Registry

### 1.1 GovernanceToken (`SD`)
- **Contract Address:** `0x051c758521971f5c5a84edaf18eea12854375469`
- **Source File:** `contracts/src/GovernanceToken.sol`
- **Compiler:** Solidity `0.8.28` (Optimized: 200 runs)

| Storage Variable / Role | Current On-Chain Value | Storage Description |
| :--- | :--- | :--- |
| `name` | `"Shaggy Dogg"` | Token Name |
| `symbol` | `"SD"` | Ticker Symbol |
| `decimals` | `18` | Base Unit Precision |
| `totalSupply` | `1,000,000,000,000,000,000,000,000` | Fixed supply: 1,000,000 SD |
| `MAX_SUPPLY` | `1,000,000,000,000,000,000,000,000` | Immutable hard cap |
| `admin` | `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` | Root owner (`ShaggyDogg`) |
| `minter` | `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` | Dedicated minter role |
| `_balances[Root Admin]` | `200,000,000,000,000,000,000,000` (200,000 SD) | Active founder holding |
| `_balances[SD/WETH Pair]` | `800,000,000,000,000,000,000,000` (800,000 SD) | AMM reserve holding |

---

### 1.2 Uniswap V2 SD / WETH Pair
- **Contract Address:** `0x63D504336d01BcCa615B23AD393E5812Dc646BF8`
- **Factory Address:** `0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e`
- **Creation Tx:** `0x2e41545dc517a5a5ea9777d9e56194616d1e8ba1beb675f769e3a782e7a69ec5` (Block `47452824`)

| State Parameter | Current On-Chain Value | Storage Description |
| :--- | :--- | :--- |
| `token0` | `0x051c758521971f5c5a84edaf18eea12854375469` | SD Token |
| `token1` | `0x4200000000000000000000000000000000000006` | Base Canonical WETH9 |
| `reserve0` | `800,000 SD` ($8 \times 10^{23}$ wei) | Active Constant Product Reserve |
| `reserve1` | `0.001 WETH` ($1 \times 10^{15}$ wei) | Active Constant Product Reserve |
| `totalSupply` (LP) | `28.284271247461900976` LP | Total minted liquidity units |
| `balanceOf(Root Admin)` | `28.284271247461899976` LP | 100% circulating pool ownership |
| `balanceOf(0x0)` | `0.000000000000001000` LP (1,000 wei) | Permanently locked minimum liquidity |

---

### 1.3 FeeDiscountStaking
- **Contract Address:** `0x42134ccc6c41149cf71c7b4994e33ee66758af20`
- **Source File:** `contracts/src/FeeDiscountStaking.sol`
- **Deployment Tx:** `0xa54b1f31ac9c8afc42582f110bba81ca2c4a22386cede7c917d2d9c252da37ee` (Block `47452616`)

| State Parameter | Configured Value | Operational Logic |
| :--- | :--- | :--- |
| `stakingToken` | `0x051c758521971f5c5a84edaf18eea12854375469` | SD Token address |
| `owner` | `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` | Protocol admin |
| `LOCK_PERIOD` | `7 days` (604,800 seconds) | Standard staker lockup |
| `UNSTAKE_FEE_BPS` | `100` (1.0%) | Penalty on early unstaking |
| **Tier 1 Threshold** | `1,000 SD` | 10% Fee Discount (1000 bps) |
| **Tier 2 Threshold** | `5,000 SD` | 25% Fee Discount (2500 bps) |
| **Tier 3 Threshold** | `20,000 SD` | 50% Fee Discount (5000 bps) |
| **Tier 4 Threshold** | `50,000 SD` | 100% Fee Discount (10000 bps - Zero Fee Trading) |

---

### 1.4 AaveFlashBorrower
- **Contract Address:** `0xa5b50037a8d2fda22805f750252268adaeb36480`
- **Source File:** `contracts/src/AaveFlashBorrower.sol`
- **Deployment Tx:** `0x771b420b2cccc164f5045f7322a67e1b4be8ef5369ff80715b4aa48db3b61512` (Block `47452616`)
- **Aave v3 Pool Target:** `0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b` (Base Sepolia Pool)
- **Quant Directive:** Directive 340 (Uncollateralized Flash Arbitrage Solver)

---

### 1.5 YieldStakingVault
- **Contract Address:** `0x8531807ef36560cd7db230c95db85791aa586dda`
- **Source File:** `contracts/src/YieldStakingVault.sol`
- **Deployment Tx:** `0x8da1b5c8d7e27acc770a2c707d486cdfed1988bdb81fca7e309c9072f5bef2d2` (Block `47452617`)
- **Underlying Asset:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Testnet USDC)
- **Aave v3 Pool:** `0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b`
- **Staking Discount Integration:** `0x42134ccc6c41149cf71c7b4994e33ee66758af20`
- **Quant Directive:** Directive 342 (Aave Supply/Withdraw Yield Modeling)

---

### 1.6 CompoundYieldVault
- **Contract Address:** `0x38cccafb4ae96a8ef187f07fb17d18eb63e43782`
- **Source File:** `contracts/src/CompoundYieldVault.sol`
- **Deployment Tx:** `0xf7d1ae8ed55f21a8a444a87c4c609df608cf91f497d6fca1194159f7bbe75ed6` (Block `47452645`)
- **Compound v3 Comet:** `0x6D88c0352a9d114b5cEeC8a82de9ff9F5D21f2dc` (cUSDCv3)
- **Staking Discount Integration:** `0x42134ccc6c41149cf71c7b4994e33ee66758af20`

---

## 2. File & Storage Pointer Summary

- **Local Machine Root:** `C:\Users\fbada\source\repos\shaggy-dogg-dex`
- **Deployment Manifest (JSON):** [`deployments/base-sepolia.json`](file:///C:/Users/fbada/source/repos/shaggy-dogg-dex/deployments/base-sepolia.json)
- **TypeScript Contract Config:** [`src/lib/contracts.ts`](file:///C:/Users/fbada/source/repos/shaggy-dogg-dex/src/lib/contracts.ts)
- **Liquidity Approval Record:** [`docs/liquidity/SD-INITIAL-LIQUIDITY-APPROVAL-2026-09-29.md`](file:///C:/Users/fbada/source/repos/shaggy-dogg-dex/docs/liquidity/SD-INITIAL-LIQUIDITY-APPROVAL-2026-09-29.md)
- **Mainnet Readiness Profile:** [`src/lib/amm/mainnet-readiness.ts`](file:///C:/Users/fbada/source/repos/shaggy-dogg-dex/src/lib/amm/mainnet-readiness.ts)
