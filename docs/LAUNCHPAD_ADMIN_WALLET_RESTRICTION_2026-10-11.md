# Launchpad Admin-Only Wallet Gate (Operator Security)

**Timestamp:** 2026-10-11T14:24:00-07:00  
**Status:** Permanent Production Security Gate  
**Target Environment:** `https://dex.lumsian.com/launchpad`  
**Authorized Admin Address:** `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98` (`ShaggyDogg`)  

---

## 1. Executive Summary

To completely eliminate **Risk #4 ("Token launchpad exposure")**—specifically the risk of anonymous third parties launching scam, rug-pull, or copyright-infringing tokens through `dex.lumsian.com`—token creation has been permanently wallet-gated.

Only the protocol deployer and administrator (`0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`) can trigger new smart contract deployments.

---

## 2. Defense-in-Depth Implementation

The security gate operates at both the **UI presentation layer** and the **underlying execution engine**:

### A. Execution Engine Layer (`src/lib/launchpad/deployEngine.ts`)
Inside `executeLaunchpadDeployment`, an immutable guard validates the caller:
```ts
const adminWallet = CANONICAL_BASE_CONTRACTS.DeployerAdminWallet.toLowerCase();
if (userAddress.toLowerCase() !== adminWallet) {
  throw new Error(
    `Deployment restricted: Only protocol administrator (${CANONICAL_BASE_CONTRACTS.DeployerAdminWallet}) can launch tokens.`
  );
}
```
Even if someone invokes contract deployment directly via browser console, the transaction execution aborts before any bytecode is dispatched to the network.

### B. User Interface Layer (`src/pages/Launchpad.tsx`)
1. **Hero Header Badge:**
   - **For Admin (`0x9dC0...7C98`):** Displays green badge:  
     `🛡️ Verified Admin: ShaggyDogg (0x9dC0...7C98)`
   - **For Visitors / Unconnected Users:** Displays amber badge:  
     `🔒 Operator Restricted (0x9dC0...7C98)`
2. **Review Tab Launch Button:**
   - Disabled for non-admins with informative text:  
     `🔒 Deployment Restricted (Admin Only)`  
     `Studio restricted to Admin: 0x9dC0...7C98`
   - Unlocked exclusively when connected as `0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98`.
3. **Guard in `handleLaunch`:**
   - Explicit pre-execution check with user-facing toast alert.

---

## 3. Verification

- **Automated Tests:** 27 of 27 test suites passed (`120/120` unit tests).
- **TypeScript & Build:** Built cleanly in 27s (`dist/` generated).
- **Deployment:** Live on Vercel production at `https://dex.lumsian.com`.
