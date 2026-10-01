# 24/7 Autonomous AI Arbitrage Bot — VPS & Cloud Server Guide

This guide explains how to deploy and operate the **Shaggy Mutt DEX Autonomous AI Arbitrage Bot Daemon** on a remote Linux server (Ubuntu/Debian, AWS, DigitalOcean, Hetzner, etc.) for continuous 24/7 execution on Base Mainnet.

---

## 1. Architecture & Execution Flow

```
┌────────────────────────────────┐
│   Base Mainnet WebSocket RPC   │ (wss://base-rpc.publicnode.com or Alchemy/Infura)
└───────────────┬────────────────┘
                │ Real-time Block Stream (~2s per block)
                ▼
┌────────────────────────────────┐
│   Arbitrage Bot Daemon (Node)  │ (scripts/arbitrage-bot-daemon.ts)
├────────────────────────────────┤
│ 1. AI Profit Delta Guard       │ -> Net Profit > Min Hurdle ($500.00 default)
│ 2. Base Gas Ceiling Guard      │ -> Base Gas < Max Cap (0.01 Gwei default)
│ 3. Slippage Margin Guard       │ -> Slippage < 0.20%
└───────────────┬────────────────┘
                │ Qualified Signals Dispatched in Milliseconds
                ▼
┌────────────────────────────────┐
│    Base On-Chain Execution     │
│  - Triangular Swap Cycle       │ (Uniswap V2 Router on Base)
│  - Cross-DEX Spread Legs       │ (Uniswap V2 ↔ Aerodrome)
│  - Aave v3 Flash Loans         │ (AaveFlashBorrower.sol)
└────────────────────────────────┘
```

---

## 2. Server Requirements

- **OS**: Ubuntu 22.04 / 24.04 LTS or Debian 12
- **Memory**: 1 GB RAM minimum (2 GB recommended)
- **Node.js**: v20.0.0 or higher (Node v26 supported)
- **Process Manager**: PM2 or `systemd`

---

## 3. Quick Start Setup

### Step A: Clone & Install Dependencies
```bash
git clone https://github.com/your-org/shaggy-dogg-dex.git
cd shaggy-dogg-dex
npm install
```

### Step B: Configure Environment
Copy the bot configuration template:
```bash
cp .env.bot.example .env.bot
```

Edit `.env.bot`:
```bash
nano .env.bot
```

Provide your dedicated operator key and parameters:
```env
# Dedicated Operator Private Key (0x-prefixed 64 hex characters)
OPERATOR_PRIVATE_KEY=0x...your_dedicated_bot_key_here...

# Base Mainnet RPC Endpoints
BASE_RPC_HTTP=https://mainnet.base.org
BASE_RPC_WS=wss://base-rpc.publicnode.com

# Minimum required net profit in USD per trade
MIN_NET_PROFIT_USD=500.0

# Maximum price slippage tolerance (20 bps = 0.20%)
MAX_SLIPPAGE_BPS=20

# Maximum Base gas fee ceiling in Gwei
MAX_GAS_GWEI=0.01

# Capital Allocation
TRADE_CAPITAL_ETH=2.0
FLASH_BORROW_USDC=50000
VIP_TIER=3

# Target AaveFlashBorrower Contract on Base
AAVE_BORROWER_ADDRESS=0x936a3D52c3037848879F3641dfBc9132aAe51bDF
```

> [!CAUTION]
> **Hot-Wallet Security**: Never use a wallet holding cold storage assets or deployer permissions. Fund your dedicated bot operator address with only a small gas buffer (e.g., `0.005 ETH` on Base, sufficient for hundreds of L2 transactions).

---

## 4. Running the Bot

### Option 1: Dry-Run Simulation (No Real Funds Dispatched)
Test connection, latency, and block stream without signing live transactions:
```bash
npm run bot:arbitrage:dry-run
```

### Option 2: Live 24/7 Background Service with PM2 (Recommended)
Install PM2 globally if not already installed:
```bash
npm install -g pm2
```

Start the bot using the included ecosystem file:
```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

View real-time streaming logs:
```bash
pm2 logs shaggy-arbitrage-bot
```

Monitor memory & CPU:
```bash
pm2 monit
```

### Option 3: Systemd Service (Alternative)
Create `/etc/systemd/system/shaggy-arbitrage.service`:
```ini
[Unit]
Description=Shaggy Mutt DEX AI Arbitrage Bot
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/shaggy-dogg-dex
EnvironmentFile=/home/ubuntu/shaggy-dogg-dex/.env.bot
ExecStart=/usr/bin/npx tsx scripts/arbitrage-bot-daemon.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable shaggy-arbitrage
sudo systemctl start shaggy-arbitrage
sudo journalctl -u shaggy-arbitrage -f
```

---

## 5. Anti-Loss Guarantees

1. **Pre-Flight Mathematical Gate**: Every block calculates gross profit minus multi-pool AMM fees, Aave loan premium, and priority gas before sending anything.
2. **Atomic Smart Contract Revert**: If market prices shift between block submission and inclusion, [`AaveFlashBorrower.sol`](file:///C:/Users/fbada/source/repos/shaggy-dogg-dex/contracts/src/AaveFlashBorrower.sol) checks that ending balance $\ge \text{debt} + \text{minProfit}$. If not, the transaction reverts on-chain with zero principal loss.
3. **Gas Surge Protection**: The bot halts trade dispatch if Base gas exceeds `MAX_GAS_GWEI`.
