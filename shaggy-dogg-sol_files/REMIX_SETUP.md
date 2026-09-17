# Remix IDE Setup Guide for Shaggy Dogg DEX

## Overview

This directory contains all Solidity smart contracts for the Shaggy Dogg DEX protocol, optimized for deployment via Remix IDE with 2025 specifications and standards.

## Quick Start

### 1. Upload to Remix

1. Go to [remix.ethereum.org](https://remix.ethereum.org)
2. Create a new workspace or select existing
3. Upload all `.sol` files from this directory
4. Upload configuration files (`.solhintrc.json`, `.prettierrc`, `remix.config.json`)

### 2. Configure Compiler

**Compiler Settings:**
- **Version:** `0.8.28` (latest stable)
- **EVM Version:** `cancun` (2025 standard)
- **Optimization:** `Enabled` with 200 runs
- **Via IR:** `Disabled` (for faster compilation)

**In Remix:**
1. Click **Solidity Compiler** tab
2. Set compiler version to `0.8.28`
3. Click **Advanced Configurations**
4. Set:
   - EVM Version: `cancun`
   - Enable optimization: ✓
   - Runs: `200`
   - Enable Yul optimizer: ✓

### 3. Compilation Order

Compile in this order to resolve dependencies:

```
1. GovernanceToken.sol
2. FeeDiscountStaking.sol
3. Deploy.sol
```

### 4. Deployment Process

#### Option A: Single-Transaction Deployment (Recommended)

1. **Deploy the Deploy contract:**
   - Select `Deploy` from contract dropdown
   - Click **Deploy** (orange button)
   - Confirm transaction in MetaMask

2. **Execute deployment:**
   - Find deployed `Deploy` contract
   - Click **run** function
   - This deploys both GovernanceToken and FeeDiscountStaking
   - Configure staking parameters automatically

3. **Get addresses:**
   - Click **getAddresses** to retrieve contract addresses
   - Save these for frontend integration

#### Option B: Manual Deployment

1. **Deploy GovernanceToken:**
   ```
   Constructor Parameters:
   - name_: "Protocol Token"
   - symbol_: "PTK"
   - initialAdmin: <YOUR_ADDRESS>
   - initialMinter: <YOUR_ADDRESS>
   - initialMint: "1000000000000000000000000" (1M tokens)
   ```

2. **Deploy FeeDiscountStaking:**
   ```
   Constructor Parameters:
   - token_: <GOVERNANCE_TOKEN_ADDRESS>
   - admin_: <YOUR_ADDRESS>
   - tierAdmin_: <YOUR_ADDRESS>
   ```

3. **Configure Staking Tiers:**
   Call `setTiers` with:
   ```json
   [
     ["1000000000000000000000", 100],      // 1,000 tokens = 1% discount
     ["10000000000000000000000", 250],     // 10,000 tokens = 2.5% discount
     ["100000000000000000000000", 500],    // 100,000 tokens = 5% discount
     ["1000000000000000000000000", 1000]   // 1,000,000 tokens = 10% discount
   ]
   ```

4. **Set withdrawal fee:**
   ```
   setWithdrawalFee(100)  // 1% fee
   ```

5. **Set minimum stake period:**
   ```
   setMinimumStakePeriod(604800)  // 7 days in seconds
   ```

## Network Configuration

### Testnet Deployment (Recommended First)

**Sepolia Testnet:**
- Chain ID: `11155111`
- RPC: `https://sepolia.infura.io/v3/YOUR_KEY`
- Faucet: [sepoliafaucet.com](https://sepoliafaucet.com)

**Base Sepolia:**
- Chain ID: `84532`
- RPC: `https://sepolia.base.org`
- Faucet: [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)

### Mainnet Deployment

**Ethereum Mainnet:**
- Chain ID: `1`
- ⚠️ Ensure thorough testing before mainnet deployment

**Base Mainnet (Recommended for lower fees):**
- Chain ID: `8453`
- Lower gas fees, faster transactions

## Post-Deployment Verification

### Verify Contracts on Etherscan

1. **Get Flattened Source:**
   - In Remix, right-click contract file
   - Select "Flatten"
   - Copy flattened code

2. **Submit to Etherscan:**
   - Go to Etherscan contract page
   - Click "Verify and Publish"
   - Paste flattened source
   - Set compiler version: `0.8.28`
   - Set optimization: `Yes` with `200` runs
   - Set EVM version: `cancun`

### Using Sourcify (Recommended)

1. In Remix, go to **Plugin Manager**
2. Activate **Sourcify**
3. After deployment, click **Verify** in Sourcify plugin
4. Automatic verification with metadata

## Testing in Remix

### Unit Tests

Create test files in `tests/` directory:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "remix_tests.sol";
import "../GovernanceToken.sol";

contract GovernanceTokenTest {
    GovernanceToken token;

    function beforeEach() public {
        token = new GovernanceToken(
            "Test Token",
            "TST",
            address(this),
            address(this),
            1000000e18
        );
    }

    function testInitialSupply() public {
        Assert.equal(token.totalSupply(), 1000000e18, "Initial supply incorrect");
    }
}
```

### Manual Testing Checklist

- [ ] Token minting works
- [ ] Token transfers work
- [ ] Delegation works
- [ ] Staking deposit works
- [ ] Staking withdrawal works
- [ ] Fee calculation is correct
- [ ] Access control prevents unauthorized actions
- [ ] Pause/unpause functionality works

## Security Considerations

### Before Mainnet Deployment

1. **Run Static Analysis:**
   - Enable Slither plugin in Remix
   - Review all warnings and errors

2. **Gas Optimization:**
   - Review gas estimates in Remix
   - Target < 3M gas for deployment
   - Target < 200k gas for user operations

3. **Access Control:**
   - Verify admin roles are set correctly
   - Test role-based permissions
   - Plan for admin key management

4. **Audit Checklist:**
   - [ ] Reentrancy protection verified
   - [ ] Integer overflow protection (built-in 0.8.x)
   - [ ] Access control tested
   - [ ] Emergency functions work
   - [ ] Pausable mechanism tested
   - [ ] External calls are safe

## Frontend Integration

### Export ABIs

After compilation, ABIs are automatically generated:

1. In Remix, go to **Solidity Compiler** tab
2. Scroll to **Compilation Details**
3. Copy ABI JSON
4. Save to:
   ```
   ../src/abi/GovernanceToken.json
   ../src/abi/FeeDiscountStaking.json
   ```

### Contract Addresses

Save deployed addresses in:
```
../deployments/<CHAIN_ID>-latest.json
```

Format:
```json
{
  "chainId": 11155111,
  "timestamp": 1704067200,
  "blockNumber": 12345678,
  "contracts": {
    "GovernanceToken": "0x...",
    "FeeDiscountStaking": "0x..."
  }
}
```

## Troubleshooting

### Common Issues

**Issue:** "Undeclared identifier"
- **Solution:** Check import paths, compile dependencies first

**Issue:** "Gas estimation failed"
- **Solution:** Check constructor parameters, ensure sufficient balance

**Issue:** "Contract creation code exceeds 24576 bytes"
- **Solution:** Enable optimizer with higher runs (400+)

**Issue:** "Deployment transaction reverted"
- **Solution:** Check constructor logic, verify parameters

### Getting Help

- **Remix Documentation:** [remix-ide.readthedocs.io](https://remix-ide.readthedocs.io)
- **Solidity Docs:** [docs.soliditylang.org](https://docs.soliditylang.org)
- **OpenZeppelin Forum:** [forum.openzeppelin.com](https://forum.openzeppelin.com)

## Best Practices

### Code Quality

- ✅ Use latest Solidity (0.8.28)
- ✅ Enable optimizer for production
- ✅ Use custom errors (gas efficient)
- ✅ Follow CEI pattern (Checks-Effects-Interactions)
- ✅ Use NatSpec documentation
- ✅ Implement emergency pause mechanism

### Deployment Strategy

1. **Test on local network** (Remix VM)
2. **Deploy to testnet** (Sepolia)
3. **Verify and test** all functions
4. **Get audit** (if handling significant value)
5. **Deploy to mainnet**
6. **Verify on Etherscan/Sourcify**
7. **Monitor** initial transactions closely

## Configuration Files Reference

### remix.config.json
- Compiler settings
- Network configurations
- Deployment sequences
- Security checks
- Plugin configurations

### .solhintrc.json
- Linting rules
- Code quality standards
- Best practice enforcement

### .prettierrc
- Code formatting
- Consistent style

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
- Create an issue in the repository
- Join our Discord community
- Contact the development team

---

**Last Updated:** 2025-01-17
**Solidity Version:** 0.8.28
**EVM Version:** Cancun
**Remix IDE Version:** Latest
