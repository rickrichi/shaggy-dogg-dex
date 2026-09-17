# Shaggy Dogg DEX - Smart Contract Integration Guide

**Hybrid Architecture Strategy: Merging Solidity Contracts with Frontend**

---

## 🎯 Integration Overview

This guide shows how to integrate your `shaggy-dogg-sol_files/` Solidity contracts into your React + Vite + Wagmi application, creating a unified full-stack Web3 DApp.

### Current Stack
- **Frontend:** React 18 + TypeScript + Vite
- **Web3:** Wagmi v2 + Viem v2 + @reown/appkit
- **Backend:** Node.js + Hono (API server)
- **Contracts:** Solidity 0.8.28 (Remix-ready)

---

## 📁 Proposed Unified Structure

```
shaggy-dogg-dex/
├── 📂 contracts/                    # ← NEW: Unified contract directory
│   ├── src/
│   │   ├── GovernanceToken.sol
│   │   ├── FeeDiscountStaking.sol
│   │   └── Deploy.sol
│   ├── out/                         # ← Build artifacts (Foundry)
│   ├── cache/
│   ├── test/                        # ← Contract tests
│   │   ├── GovernanceToken.t.sol
│   │   └── FeeDiscountStaking.t.sol
│   ├── script/
│   │   └── Deploy.s.sol
│   ├── foundry.toml                 # ← Foundry config
│   ├── remappings.txt
│   └── README.md
│
├── 📂 src/                          # Frontend source
│   ├── abi/                         # ← Auto-generated from contracts
│   │   ├── GovernanceToken.json
│   │   └── FeeDiscountStaking.json
│   ├── hooks/
│   │   ├── contracts/               # ← NEW: Contract hooks
│   │   │   ├── useGovernanceToken.ts
│   │   │   ├── useFeeDiscountStaking.ts
│   │   │   └── index.ts
│   │   └── ...
│   ├── lib/
│   │   ├── contracts.ts             # ← NEW: Contract addresses
│   │   └── ...
│   ├── generated/                   # ← Wagmi CLI output
│   │   └── wagmi.ts
│   └── wagmi.ts
│
├── 📂 scripts/                      # Build automation
│   ├── deploy-contracts.ts          # ← NEW: Deployment
│   ├── generate-types.ts            # ← NEW: Type generation
│   └── sync-abis.ts                 # ← NEW: ABI sync
│
├── 📂 deployments/                  # ← NEW: Deployment records
│   ├── mainnet.json
│   ├── sepolia.json
│   └── localhost.json
│
└── 📂 shaggy-dogg-sol_files/       # ← ARCHIVE (keep for Remix)
    └── ... (original files)
```

---

## 🚀 Step-by-Step Integration

### Phase 1: Setup Contract Development Environment

#### 1.1 Install Foundry (Recommended) or Keep Remix

**Option A: Foundry (Full Development)**
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Initialize in project
cd /mnt/c/Users/catty/Desktop/shaggy-dogg-dex
forge init contracts --no-commit
```

**Option B: Remix Only (Simpler)**
```bash
# Keep using Remix, just organize better
mkdir -p contracts/src
```

#### 1.2 Organize Contracts

```bash
# Create contract directories
mkdir -p contracts/src
mkdir -p contracts/test
mkdir -p contracts/script

# Copy contracts from shaggy-dogg-sol_files
cp shaggy-dogg-sol_files/GovernanceToken.sol contracts/src/
cp shaggy-dogg-sol_files/FeeDiscountStaking.sol contracts/src/
cp shaggy-dogg-sol_files/Shaggy-Dogg-Dex.sol contracts/src/Deploy.sol
```

---

### Phase 2: Configure Build Pipeline

#### 2.1 Create Foundry Config (if using Foundry)

```toml
# contracts/foundry.toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.8.28"
optimizer = true
optimizer_runs = 200
evm_version = "cancun"

[rpc_endpoints]
mainnet = "${MAINNET_RPC_URL}"
sepolia = "${SEPOLIA_RPC_URL}"
localhost = "http://localhost:8545"

[etherscan]
mainnet = { key = "${ETHERSCAN_API_KEY}" }
sepolia = { key = "${ETHERSCAN_API_KEY}" }
```

#### 2.2 Update package.json Scripts

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",

    "contracts:compile": "forge build --root contracts",
    "contracts:test": "forge test --root contracts",
    "contracts:deploy:local": "forge script contracts/script/Deploy.s.sol --rpc-url localhost --broadcast",
    "contracts:deploy:sepolia": "forge script contracts/script/Deploy.s.sol --rpc-url sepolia --broadcast --verify",

    "abi:sync": "tsx scripts/sync-abis.ts",
    "abi:generate": "wagmi generate",

    "dev:full": "concurrently \"npm run dev\" \"npm run api:dev\"",
    "dev:contracts": "forge test --watch --root contracts",

    "deploy:full": "npm run contracts:compile && npm run abi:sync && npm run build"
  },
  "devDependencies": {
    "concurrently": "^9.1.0",
    "@wagmi/cli": "^2.8.0",
    "abitype": "^1.0.0",
    "tsx": "^4.19.2"
  }
}
```

---

### Phase 3: ABI Synchronization

#### 3.1 Create ABI Sync Script

```typescript
// scripts/sync-abis.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface ContractArtifact {
  abi: any[];
  bytecode: { object: string };
  deployedBytecode: { object: string };
}

const CONTRACTS = ['GovernanceToken', 'FeeDiscountStaking'];
const SOURCE_DIR = './contracts/out';
const TARGET_DIR = './src/abi';

async function syncABIs() {
  console.log('🔄 Syncing ABIs from contract artifacts...\n');

  if (!existsSync(TARGET_DIR)) {
    mkdirSync(TARGET_DIR, { recursive: true });
  }

  for (const contract of CONTRACTS) {
    try {
      const artifactPath = join(SOURCE_DIR, `${contract}.sol`, `${contract}.json`);

      if (!existsSync(artifactPath)) {
        console.warn(`⚠️  ${contract}: Artifact not found at ${artifactPath}`);
        continue;
      }

      const artifact: ContractArtifact = JSON.parse(
        readFileSync(artifactPath, 'utf-8')
      );

      const targetPath = join(TARGET_DIR, `${contract}.json`);
      writeFileSync(targetPath, JSON.stringify(artifact.abi, null, 2));

      console.log(`✅ ${contract}: ABI synced`);
    } catch (error) {
      console.error(`❌ ${contract}: Failed -`, error.message);
    }
  }

  console.log('\n✨ ABI sync complete!\n');
}

syncABIs().catch(console.error);
```

#### 3.2 Configure Wagmi CLI

```typescript
// wagmi.config.ts
import { defineConfig } from '@wagmi/cli';
import { react } from '@wagmi/cli/plugins';
import { foundry } from '@wagmi/cli/plugins';

export default defineConfig({
  out: 'src/generated/wagmi.ts',
  plugins: [
    foundry({
      project: './contracts',
      include: [
        'GovernanceToken.sol/**',
        'FeeDiscountStaking.sol/**',
      ],
    }),
    react(),
  ],
});
```

---

### Phase 4: Contract Address Management

#### 4.1 Create Deployment Registry

```typescript
// src/lib/contracts.ts
import { Address } from 'viem';

export interface DeployedContracts {
  GovernanceToken: Address;
  FeeDiscountStaking: Address;
  deployedAt: number;
  deployer: Address;
}

export const CONTRACTS: Record<number, DeployedContracts> = {
  // Mainnet
  1: {
    GovernanceToken: '0x0000000000000000000000000000000000000000',
    FeeDiscountStaking: '0x0000000000000000000000000000000000000000',
    deployedAt: 0,
    deployer: '0x0000000000000000000000000000000000000000',
  },
  // Sepolia
  11155111: {
    GovernanceToken: '0x0000000000000000000000000000000000000000',
    FeeDiscountStaking: '0x0000000000000000000000000000000000000000',
    deployedAt: 0,
    deployer: '0x0000000000000000000000000000000000000000',
  },
  // Localhost
  31337: {
    GovernanceToken: '0x5FbDB2315678afecb367f032d93F642f64180aa3', // Example
    FeeDiscountStaking: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', // Example
    deployedAt: Date.now(),
    deployer: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  },
};

export function getContracts(chainId: number): DeployedContracts | undefined {
  return CONTRACTS[chainId];
}

export function getContractAddress(
  chainId: number,
  contract: keyof Omit<DeployedContracts, 'deployedAt' | 'deployer'>
): Address | undefined {
  return CONTRACTS[chainId]?.[contract];
}
```

#### 4.2 Auto-Update from Deployments

```typescript
// scripts/update-contracts.ts
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

interface DeploymentInfo {
  chainId: number;
  timestamp: number;
  blockNumber: number;
  deployer: string;
  contracts: {
    GovernanceToken: string;
    FeeDiscountStaking: string;
  };
}

async function updateContracts() {
  const deploymentFiles = ['sepolia.json', 'mainnet.json', 'localhost.json'];
  const contractsPath = './src/lib/contracts.ts';

  let contractsConfig: Record<number, any> = {};

  for (const file of deploymentFiles) {
    const path = join('./deployments', file);
    try {
      const deployment: DeploymentInfo = JSON.parse(readFileSync(path, 'utf-8'));
      contractsConfig[deployment.chainId] = {
        GovernanceToken: deployment.contracts.GovernanceToken,
        FeeDiscountStaking: deployment.contracts.FeeDiscountStaking,
        deployedAt: deployment.timestamp,
        deployer: deployment.deployer,
      };
      console.log(`✅ Loaded ${file}`);
    } catch (e) {
      console.log(`⏭️  Skipped ${file} (not found)`);
    }
  }

  // Generate TypeScript file
  const output = `// Auto-generated from deployments/ - DO NOT EDIT MANUALLY
import { Address } from 'viem';

export interface DeployedContracts {
  GovernanceToken: Address;
  FeeDiscountStaking: Address;
  deployedAt: number;
  deployer: Address;
}

export const CONTRACTS: Record<number, DeployedContracts> = ${JSON.stringify(contractsConfig, null, 2)};

export function getContracts(chainId: number): DeployedContracts | undefined {
  return CONTRACTS[chainId];
}

export function getContractAddress(
  chainId: number,
  contract: keyof Omit<DeployedContracts, 'deployedAt' | 'deployer'>
): Address | undefined {
  return CONTRACTS[chainId]?.[contract];
}
`;

  writeFileSync(contractsPath, output);
  console.log('\n✨ Contracts config updated!\n');
}

updateContracts().catch(console.error);
```

---

### Phase 5: Create Contract Hooks

#### 5.1 Governance Token Hook

```typescript
// src/hooks/contracts/useGovernanceToken.ts
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { getContractAddress } from '@/lib/contracts';
import GovernanceTokenABI from '@/abi/GovernanceToken.json';

export function useGovernanceToken() {
  const { chainId } = useAccount();
  const contractAddress = chainId ? getContractAddress(chainId, 'GovernanceToken') : undefined;

  // Read functions
  const { data: balance } = useReadContract({
    address: contractAddress,
    abi: GovernanceTokenABI,
    functionName: 'balanceOf',
    args: [useAccount().address],
    query: { enabled: !!contractAddress && !!useAccount().address },
  });

  const { data: totalSupply } = useReadContract({
    address: contractAddress,
    abi: GovernanceTokenABI,
    functionName: 'totalSupply',
  });

  const { data: maxSupply } = useReadContract({
    address: contractAddress,
    abi: GovernanceTokenABI,
    functionName: 'MAX_SUPPLY',
  });

  // Write functions
  const { writeContract: transfer, data: transferHash } = useWriteContract();
  const { isLoading: isTransferring } = useWaitForTransactionReceipt({ hash: transferHash });

  const { writeContract: approve, data: approveHash } = useWriteContract();
  const { isLoading: isApproving } = useWaitForTransactionReceipt({ hash: approveHash });

  return {
    // Contract info
    address: contractAddress,

    // Balances
    balance: balance ? formatUnits(balance as bigint, 18) : '0',
    balanceRaw: balance as bigint,
    totalSupply: totalSupply ? formatUnits(totalSupply as bigint, 18) : '0',
    maxSupply: maxSupply ? formatUnits(maxSupply as bigint, 18) : '0',

    // Actions
    transfer: (to: Address, amount: string) => {
      transfer({
        address: contractAddress!,
        abi: GovernanceTokenABI,
        functionName: 'transfer',
        args: [to, parseUnits(amount, 18)],
      });
    },
    isTransferring,

    approve: (spender: Address, amount: string) => {
      approve({
        address: contractAddress!,
        abi: GovernanceTokenABI,
        functionName: 'approve',
        args: [spender, parseUnits(amount, 18)],
      });
    },
    isApproving,
  };
}
```

#### 5.2 Staking Hook

```typescript
// src/hooks/contracts/useFeeDiscountStaking.ts
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, Address } from 'viem';
import { getContractAddress } from '@/lib/contracts';
import FeeDiscountStakingABI from '@/abi/FeeDiscountStaking.json';

export function useFeeDiscountStaking() {
  const { address: userAddress, chainId } = useAccount();
  const contractAddress = chainId ? getContractAddress(chainId, 'FeeDiscountStaking') : undefined;

  // Read user's staked balance
  const { data: stakedBalance, refetch: refetchBalance } = useReadContract({
    address: contractAddress,
    abi: FeeDiscountStakingABI,
    functionName: 'stakedBalance',
    args: [userAddress],
    query: { enabled: !!contractAddress && !!userAddress },
  });

  // Read user's discount tier
  const { data: discountBps } = useReadContract({
    address: contractAddress,
    abi: FeeDiscountStakingABI,
    functionName: 'getTier',
    args: [userAddress],
    query: { enabled: !!contractAddress && !!userAddress },
  });

  // Read staking parameters
  const { data: minimumStakePeriod } = useReadContract({
    address: contractAddress,
    abi: FeeDiscountStakingABI,
    functionName: 'minimumStakePeriod',
  });

  const { data: withdrawalFeeBps } = useReadContract({
    address: contractAddress,
    abi: FeeDiscountStakingABI,
    functionName: 'withdrawalFeeBps',
  });

  // Write functions
  const { writeContract: stake, data: stakeHash } = useWriteContract();
  const { isLoading: isStaking, isSuccess: stakeSuccess } = useWaitForTransactionReceipt({
    hash: stakeHash,
  });

  const { writeContract: unstake, data: unstakeHash } = useWriteContract();
  const { isLoading: isUnstaking } = useWaitForTransactionReceipt({ hash: unstakeHash });

  return {
    // Contract info
    address: contractAddress,

    // User stats
    stakedBalance: stakedBalance ? formatUnits(stakedBalance as bigint, 18) : '0',
    stakedBalanceRaw: stakedBalance as bigint,
    discountPercent: discountBps ? Number(discountBps) / 100 : 0,
    discountBps: discountBps as number,

    // Staking parameters
    minimumStakePeriod: minimumStakePeriod ? Number(minimumStakePeriod) : 0,
    withdrawalFeePercent: withdrawalFeeBps ? Number(withdrawalFeeBps) / 100 : 0,

    // Actions
    stake: (amount: string) => {
      stake({
        address: contractAddress!,
        abi: FeeDiscountStakingABI,
        functionName: 'stake',
        args: [parseUnits(amount, 18)],
      });
    },
    isStaking,
    stakeSuccess,

    unstake: (amount: string) => {
      unstake({
        address: contractAddress!,
        abi: FeeDiscountStakingABI,
        functionName: 'unstake',
        args: [parseUnits(amount, 18)],
      });
    },
    isUnstaking,

    // Utilities
    refetchBalance,
  };
}
```

#### 5.3 Combined Hook

```typescript
// src/hooks/contracts/index.ts
export { useGovernanceToken } from './useGovernanceToken';
export { useFeeDiscountStaking } from './useFeeDiscountStaking';

// Combined hook for convenience
import { useGovernanceToken } from './useGovernanceToken';
import { useFeeDiscountStaking } from './useFeeDiscountStaking';

export function useShaggyDoggContracts() {
  const token = useGovernanceToken();
  const staking = useFeeDiscountStaking();

  return {
    token,
    staking,
    isReady: !!token.address && !!staking.address,
  };
}
```

---

### Phase 6: Frontend Integration Examples

#### 6.1 Staking Component

```typescript
// src/components/Staking/StakeForm.tsx
import { useState } from 'react';
import { useShaggyDoggContracts } from '@/hooks/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export function StakeForm() {
  const { token, staking } = useShaggyDoggContracts();
  const [amount, setAmount] = useState('');

  const handleStake = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      // First approve
      await token.approve(staking.address!, amount);
      toast.success('Approval successful! Now staking...');

      // Then stake
      await staking.stake(amount);
      toast.success(`Successfully staked ${amount} tokens!`);
      setAmount('');
    } catch (error) {
      toast.error('Staking failed: ' + error.message);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label>Amount to Stake</label>
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
        />
        <p className="text-sm text-muted-foreground mt-1">
          Balance: {token.balance} tokens
        </p>
      </div>

      <div className="bg-muted p-3 rounded-md">
        <p className="text-sm">Current Discount: {staking.discountPercent}%</p>
        <p className="text-sm">Staked: {staking.stakedBalance} tokens</p>
      </div>

      <Button
        onClick={handleStake}
        disabled={staking.isStaking || !amount}
      >
        {staking.isStaking ? 'Staking...' : 'Stake Tokens'}
      </Button>
    </div>
  );
}
```

---

### Phase 7: Deployment Workflow

#### 7.1 Automated Deployment Script

```typescript
// scripts/deploy-contracts.ts
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

async function deploy(network: string) {
  console.log(`\n🚀 Deploying to ${network}...\n`);

  // Run forge script
  const forge = spawn('forge', [
    'script',
    'contracts/script/Deploy.s.sol',
    '--rpc-url',
    network,
    '--broadcast',
    network !== 'localhost' ? '--verify' : '',
  ].filter(Boolean));

  forge.stdout.on('data', (data) => console.log(data.toString()));
  forge.stderr.on('data', (data) => console.error(data.toString()));

  await new Promise((resolve, reject) => {
    forge.on('close', (code) => {
      if (code === 0) resolve(null);
      else reject(new Error(`Forge exited with code ${code}`));
    });
  });

  console.log('\n✅ Deployment complete!');
  console.log('\n🔄 Syncing ABIs...');

  // Sync ABIs
  await import('./sync-abis');

  console.log('\n📝 Updating contract addresses...');

  // Update addresses
  await import('./update-contracts');

  console.log('\n✨ All done!\n');
}

const network = process.argv[2] || 'localhost';
deploy(network).catch(console.error);
```

#### 7.2 Complete Workflow

```bash
# 1. Develop contracts (Remix or locally)
# Edit contracts/src/*.sol

# 2. Compile
npm run contracts:compile

# 3. Test
npm run contracts:test

# 4. Deploy to local network
npm run contracts:deploy:local

# 5. Sync ABIs to frontend
npm run abi:sync

# 6. Generate Wagmi hooks
npm run abi:generate

# 7. Run frontend
npm run dev

# 8. Full development (all at once)
npm run dev:full
```

---

## 🔄 CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/contracts.yml
name: Smart Contracts CI

on:
  push:
    branches: [main, develop]
    paths:
      - 'contracts/**'
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1

      - name: Run tests
        run: forge test --root contracts

      - name: Check coverage
        run: forge coverage --root contracts

  deploy-testnet:
    needs: test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1

      - name: Deploy to Sepolia
        env:
          SEPOLIA_RPC_URL: ${{ secrets.SEPOLIA_RPC_URL }}
          PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
        run: npm run contracts:deploy:sepolia

      - name: Sync ABIs
        run: npm run abi:sync

      - name: Commit updated ABIs
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "chore: update contract ABIs"
```

---

## 📊 Integration Checklist

### Setup Phase
- [ ] Create `contracts/` directory structure
- [ ] Move Solidity files from `shaggy-dogg-sol_files/`
- [ ] Install Foundry (or keep Remix-only workflow)
- [ ] Create `foundry.toml` configuration
- [ ] Update `.gitignore` for contract artifacts

### Build Configuration
- [ ] Create `wagmi.config.ts`
- [ ] Add contract compilation scripts to `package.json`
- [ ] Create `scripts/sync-abis.ts`
- [ ] Create `scripts/update-contracts.ts`
- [ ] Set up deployment directories

### Contract Integration
- [ ] Create `src/lib/contracts.ts` for addresses
- [ ] Create contract hooks in `src/hooks/contracts/`
- [ ] Update existing hooks to use new contracts
- [ ] Create deployment scripts

### Frontend Updates
- [ ] Update components to use new hooks
- [ ] Add staking UI components
- [ ] Add governance/voting UI (if applicable)
- [ ] Update `wagmi.ts` configuration

### Testing
- [ ] Write contract unit tests
- [ ] Write integration tests
- [ ] Test deployment scripts
- [ ] Test frontend integration
- [ ] Test on local network
- [ ] Test on testnet (Sepolia)

### Documentation
- [ ] Document contract functions
- [ ] Document deployment process
- [ ] Update README with new structure
- [ ] Create API documentation for hooks

### Deployment
- [ ] Deploy to local network
- [ ] Deploy to Sepolia testnet
- [ ] Verify on Etherscan
- [ ] Deploy to mainnet (when ready)

---

## 🎓 Summary: Hybrid Architecture Benefits

### Before Integration
```
shaggy-dogg-sol_files/     src/
├── *.sol (isolated)   →   ├── abi/ (manual copy)
└── remix.config.json      └── wagmi.ts (manual setup)
```

### After Integration
```
contracts/                 src/
├── src/*.sol          →   ├── abi/ (auto-synced)
├── out/ (artifacts)   →   ├── generated/wagmi.ts (auto-generated)
└── foundry.toml          └── hooks/contracts/ (type-safe)
                              └── lib/contracts.ts (versioned addresses)
```

### Key Improvements
1. ✅ **Automated ABI sync** - No manual copying
2. ✅ **Type-safe hooks** - Generated from ABIs
3. ✅ **Version control** - Track contract changes with git
4. ✅ **Automated deployment** - One command deploys and updates frontend
5. ✅ **Testing integration** - Test contracts alongside frontend
6. ✅ **CI/CD ready** - Automated testing and deployment

---

**Next Steps:** Choose your integration path and I'll help you implement it step by step!
