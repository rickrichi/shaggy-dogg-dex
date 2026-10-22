# Base Mainnet Verified Swap Receipt: SD to AMUTT

**Record Created:** 2026-10-10T22:21:55-07:00 (Saturday, October 10, 2026 at 10:21:55 PM PDT)  
**Network:** Base Mainnet (EVM Chain ID: `8453`)  
**Status:** Success (Confirmed On-Chain)  

---

## 1. Transaction Overview

* **Transaction Hash:** [`0x033b32193e9b3b0ca7f1535a8689cf5124c4ddd69bc1a5b90dc36d817756f5d5`](https://base.blockscout.com/tx/0x033b32193e9b3b0ca7f1535a8689cf5124c4ddd69bc1a5b90dc36d817756f5d5)
* **Block Height:** `52453300`
* **Block Confirmation Timestamp:** `Oct 10 2026 22:19:07 (-07:00 UTC)`
* **Confirmation Time:** $\le$ 2 seconds
* **Caller (From):** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`
* **Interacted With Contract (To):** Uniswap V2 Router02 on Base (`0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`)
* **Method Called:** `swapExactTokensForTokens` (Method ID: `0x38ed1739`)
* **Frontend Application:** [https://dex.lumsian.com/swap](https://dex.lumsian.com/swap)

---

## 2. On-Chain Token Transfers (3-Leg Execution)

1. **Leg 1 (SD Sold):**
   * **Sender:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`
   * **Receiver:** `UniswapV2Pair` (`0xc3d1e0b1cd05081bd7af4cf87f681512e3e90917` - SD/WETH Pair)
   * **Amount:** **`0.0025 SD`** (`2,500,000,000,000,000` wei)
   * **Token Contract:** `0x051c758521971f5c5a84edaf18eea12854375469`

2. **Leg 2 (Intermediate WETH Bridge):**
   * **Sender:** `UniswapV2Pair` (SD/WETH)
   * **Receiver:** `UniswapV2Pair` (`0x581b294fec1a4332f17cf18b49d68087c09b6784` - AMUTT/WETH Pair)
   * **Amount:** **`0.000000000002522434 WETH`** (`2,522,434` wei)
   * **Token Contract:** `0x4200000000000000000000000000000000000006`

3. **Leg 3 (AMUTT Purchased & Delivered):**
   * **Sender:** `UniswapV2Pair` (AMUTT/WETH)
   * **Receiver:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`
   * **Amount:** **`0.207896921185183565 AMUTT`** (`207,896,921,185,183,565` wei)
   * **Token Contract:** `0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7`

---

## 3. Gas & Network Economics

* **Transaction Fee:** `0.000001908713346687 ETH` (< **$0.01 USD**)
* **Gas Price:** `0.010091417 Gwei` (`0.000000000010091417 ETH`)
* **Gas Used:** `189,040` (62.1% of `304,431` Gas Limit)
* **Base Fee:** `0.005 Gwei`
* **Max Fee / Priority Fee:** `0.025 Gwei` / `0.00509142 Gwei`
* **L1 Gas / L1 Fee:** `2,758` units / `0.000000001031877007 ETH`
* **Transaction Nonce:** `31`
* **Transaction Type:** EIP-1559 (Type 2)
* **Position in Block:** `34`

---

## 4. Decoded Contract Call & Input Data

```json
{
  "method": "swapExactTokensForTokens",
  "methodId": "0x38ed1739",
  "parameters": {
    "amountIn": "2500000000000000",
    "amountOutMin": "206857436579257647",
    "path": [
      "0x051c758521971f5c5a84eDaF18EEA12854375469",
      "0x4200000000000000000000000000000000000006",
      "0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7"
    ],
    "to": "0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98",
    "deadline": 1791696841
  }
}
```

### Raw Input Hex:
```text
0x38ed17390000000000000000000000000000000000000000000000000008e1bc9bf0400000000000000000000000000000000000000000000000000002dee7be1a745d2f00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000009dc0a2e92cc1f08050d2c5f560a45229ccf47c98000000000000000000000000000000000000000000000000000000006acb1fc90000000000000000000000000000000000000000000000000000000000000003000000000000000000000000051c758521971f5c5a84edaf18eea12854375469000000000000000000000000420000000000000000000000000000000000000600000000000000000000000041f40bae5318f2c67a4d04d1dc7a42d53a346ae7
```

---

## 5. Milestone Impact

1. **First Verified Swap:** Successfully exchanged Shaggy Dogg (`SD`) for Astro Mutt (`AMUTT`) through Uniswap V2 on Base.
2. **Production DEX Validated:** Confirms that [dex.lumsian.com/swap](https://dex.lumsian.com/swap) connects correctly to MetaMask, builds valid multi-hop routing paths, and submits successfully on Base mainnet.
3. **Permanent Public Ledger History:** The event is permanently etched into Block `52453300`, initializing public trading activity and visible candlesticks across all Base blockchain indexers and analytics services.
