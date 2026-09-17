# Quick Start: Contract Integration

**Get your Solidity contracts integrated with your frontend in 5 minutes!**

---

## 🚀 One-Command Setup

```bash
# Run the automated setup
bash scripts/setup-contracts.sh
```

This will:
- ✅ Create directory structure
- ✅ Copy contracts from `shaggy-dogg-sol_files/`
- ✅ Install dependencies
- ✅ Initialize Foundry (optional)
- ✅ Create deployment templates

---

## 📋 Manual Setup (Alternative)

If you prefer manual setup:

### 1. Create Structure

```bash
mkdir -p contracts/src deployments src/hooks/contracts
```

### 2. Copy Contracts

```bash
cp shaggy-dogg-sol_files/*.sol contracts/src/
```

### 3. Install Dependencies

```bash
npm install --save-dev tsx concurrently
```

### 4. Sync ABIs

```bash
npm run abi:sync
```

---

## 🎯 Workflow Options

### Option A: Remix Workflow (Simplest)

**Best for:** Quick prototyping, learning, no local setup

```bash
# 1. Develop in Remix
→ Open remix.ethereum.org
→ Upload contracts from contracts/src/
→ Compile and deploy

# 2. Download ABIs
→ Copy ABIs from Remix
→ Save to src/abi/*.json

# 3. Sync to frontend
npm run abi:sync
npm run dev
```

### Option B: Foundry Workflow (Recommended)

**Best for:** Production, testing, automation

```bash
# 1. Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 2. Compile contracts
npm run contracts:compile

# 3. Run tests
npm run contracts:test

# 4. Deploy
npm run contracts:deploy:local

# 5. Sync ABIs
npm run abi:sync

# 6. Start dev server
npm run dev
```

### Option C: Hybrid Workflow (Best of Both)

**Best for:** Flexibility, team collaboration

```bash
# Develop in Remix (easy UI)
→ Edit contracts in Remix

# Test with Foundry (better testing)
→ Copy contracts to contracts/src/
→ npm run contracts:test

# Deploy with Foundry (automated)
→ npm run contracts:deploy:sepolia

# Frontend stays synced automatically
→ ABIs auto-update from deployments
```

---

## 🔄 Daily Development Workflow

### Morning: Start Development

```bash
# Terminal 1: Start frontend
npm run dev

# Terminal 2: Watch contract tests (optional)
npm run dev:contracts

# Terminal 3: Start API server
npm run api:dev
```

### During Development: Make Contract Changes

```bash
# 1. Edit contracts in contracts/src/ or Remix

# 2. If using Foundry:
npm run contracts:compile
npm run contracts:test

# 3. Deploy changes
npm run contracts:deploy:local

# 4. Sync to frontend
npm run abi:sync

# Frontend auto-reloads with new ABIs!
```

### Deployment: Ship to Testnet

```bash
# 1. Final tests
npm run contracts:test

# 2. Deploy to Sepolia
npm run contracts:deploy:sepolia

# 3. Auto-sync ABIs and addresses
npm run abi:sync

# 4. Build frontend
npm run build

# 5. Deploy frontend
npm run deploy
```

---

## 📦 Available Commands

### Contract Commands

```bash
# Compile contracts (Foundry)
npm run contracts:compile

# Run tests
npm run contracts:test

# Watch tests
npm run dev:contracts

# Deploy to local network
npm run contracts:deploy:local

# Deploy to Sepolia testnet
npm run contracts:deploy:sepolia

# Deploy to mainnet
npm run contracts:deploy:mainnet
```

### ABI & Type Generation

```bash
# Sync ABIs from compiled contracts
npm run abi:sync

# Generate Wagmi hooks
npm run abi:generate

# Update contract addresses
npm run contracts:update
```

### Frontend Commands

```bash
# Start dev server
npm run dev

# Start everything (frontend + API)
npm run dev:full

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 🎨 Using Contracts in Frontend

### Example: Staking Component

```tsx
import { useShaggyDoggContracts } from '@/hooks/contracts';
import { Button } from '@/components/ui/button';

export function StakeButton() {
  const { token, staking } = useShaggyDoggContracts();

  const handleStake = async () => {
    // 1. Approve tokens
    await token.approve(staking.address, '100');

    // 2. Stake
    await staking.stake('100');
  };

  return (
    <div>
      <p>Balance: {token.balance}</p>
      <p>Staked: {staking.stakedBalance}</p>
      <p>Discount: {staking.discountPercent}%</p>

      <Button onClick={handleStake}>
        Stake 100 Tokens
      </Button>
    </div>
  );
}
```

---

## 🐛 Troubleshooting

### "ABIs not found"

```bash
# Solution: Compile contracts first
npm run contracts:compile
npm run abi:sync
```

### "Contract not deployed on this network"

```bash
# Solution: Deploy to the network you're testing on
npm run contracts:deploy:local
# or
npm run contracts:deploy:sepolia
```

### "Foundry not found"

```bash
# Solution A: Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Solution B: Use Remix workflow (no Foundry needed)
# Just compile in Remix and copy ABIs
```

### "Transaction reverted"

```bash
# Common causes:
# 1. Check you're connected to correct network
# 2. Check contract is deployed on that network
# 3. Check you have tokens/ETH
# 4. Check console for specific error

# View deployment addresses:
cat deployments/sepolia.json
```

---

## 📁 Directory Structure After Setup

```
your-project/
├── contracts/              ← Smart contracts
│   ├── src/
│   │   ├── GovernanceToken.sol
│   │   ├── FeeDiscountStaking.sol
│   │   └── Deploy.sol
│   ├── test/              ← Contract tests
│   ├── script/            ← Deployment scripts
│   └── foundry.toml       ← Foundry config
│
├── src/                   ← Frontend
│   ├── abi/              ← Auto-synced ABIs
│   ├── hooks/
│   │   └── contracts/    ← Contract hooks
│   └── lib/
│       └── contracts.ts  ← Contract addresses
│
├── deployments/          ← Deployment records
│   ├── localhost.json
│   └── sepolia.json
│
└── scripts/              ← Build scripts
    ├── sync-abis.ts
    ├── update-contracts.ts
    └── setup-contracts.sh
```

---

## ✅ Integration Checklist

### Initial Setup
- [ ] Run `bash scripts/setup-contracts.sh`
- [ ] Verify directory structure created
- [ ] Verify contracts copied

### Development
- [ ] Compile contracts (`npm run contracts:compile`)
- [ ] Run tests (`npm run contracts:test`)
- [ ] Deploy locally (`npm run contracts:deploy:local`)
- [ ] Sync ABIs (`npm run abi:sync`)
- [ ] Start frontend (`npm run dev`)

### Testing
- [ ] Test staking functionality
- [ ] Test token transfers
- [ ] Test on different networks
- [ ] Test with different wallets

### Production
- [ ] Full test suite passes
- [ ] Deploy to testnet
- [ ] Frontend integration tested
- [ ] Security review completed
- [ ] Deploy to mainnet

---

## 🎓 Next Steps

1. **Read Full Guide:** See `INTEGRATION_GUIDE.md` for detailed architecture
2. **Create Hooks:** Build custom hooks in `src/hooks/contracts/`
3. **Build UI:** Create components using your contract hooks
4. **Test Everything:** Write comprehensive tests
5. **Deploy:** Ship to testnet, then mainnet

---

## 💡 Tips

### Hot Reloading
- Frontend auto-reloads when ABIs change
- Use `npm run dev:full` to run everything at once

### Type Safety
- Wagmi generates TypeScript types from ABIs
- Get auto-complete for all contract functions!

### Multiple Networks
- Contracts can be deployed to multiple networks
- Frontend automatically uses correct addresses per network

### Version Control
- Commit contract changes with frontend changes
- Keep deployments/ in version control
- Track ABI changes in git

---

**Need Help?**
- Full documentation: `INTEGRATION_GUIDE.md`
- Remix setup: `shaggy-dogg-sol_files/REMIX_SETUP.md`
- Contract inspection: `shaggy-dogg-sol_files/INSPECTION_REPORT.md`

**Ready to build! 🚀**
