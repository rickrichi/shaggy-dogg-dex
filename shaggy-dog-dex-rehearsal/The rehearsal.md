The rehearsal runs the real weekly procedure on Base Sepolia, a test network with free test money, for three weeks before the mainnet deploy. Below are the dates, then each step.

Two things to fix first (I found these while checking)

1. The site can't claim on Base Sepolia yet. The site's wallet setup has no Base Sepolia network (src/wagmi.ts:18), and the claims panel reads only the mainnet settings file (src/components/RewardClaimsPanel.tsx:14). Testing "claim from the app" needs a small code change, kept to your local machine and not deployed to the live site.
2. Foundry only runs from drive C:. Foundry, the contract build-and-test tool, is installed inside WSL, and forge.cmd fails from D:\ ("Failed to translate"). The local test needs a copy of the repository on C:.

I can do both, plus the local test in step 0. Just say so.

Schedule

┌──────────────────┬────────────────────────────────────────────────────────┐
│       When       │                          What                          │
├──────────────────┼────────────────────────────────────────────────────────┤
│ Now – Sun 25 Oct │ Preparation (step 0)                                   │
├──────────────────┼────────────────────────────────────────────────────────┤
│ Mon 26 Oct       │ Deploy the test contracts. Test week 1 starts.         │
├──────────────────┼────────────────────────────────────────────────────────┤
│ 26 Oct – 1 Nov   │ Test wallets stake at different times                  │
├──────────────────┼────────────────────────────────────────────────────────┤
│ Mon 2 Nov        │ Publish week 1 with a profit, then claim from the site │
├──────────────────┼────────────────────────────────────────────────────────┤
│ Mon 9 Nov        │ Publish week 2 as an empty week ([])                   │
├──────────────────┼────────────────────────────────────────────────────────┤
│ Mon 16 Nov       │ Publish week 3 with a loss, to
├──────────────────┼────────────────────────────────────────────────────────┤                                                          │ 17 Nov           │ Go or no-go for the mainnet dep
└──────────────────┴────────────────────────────────────────────────────────┘                                                          
The test start time (epochOrigin) is 1792972800, which is Monday 26 October 2026, 00:00 UTC, exactly five weeks before the real start. Weeks are fixed at 7 days in the contract (WEEK = 7 up.

Step 0: Preparation

1. Test ETH: get free Base Sepolia ETH from a faucete's, for 0x9dC0…C98 and each test wallet.
2. Test USDC: get it from Circle's faucet at faucet.circle.com (choose Base Sepolia), sent to 0x9dC0…C98. Base Sepolia USDC is 0x036CbD53842c5426634e7929541eC2318f3dCF7e; check
3. 2–3 test wallets: create new accounts in MetaMask. Your owner wallet is excluded from rewards, so other wallets have to do the staking.
4. Local test: in the C: copy, run anvil --chain-id 84532, then npm run rewards:e2e -- --artifacts contracts/out. It must print "All
   local reward end-to-end checks passed."

Step 1: Deploy three test contracts (Mon 26 Oct, sig

┌─────┬──────────────────────────────┬───────────────────────────────────────────────────────────────┐
│  #  │           Contract           │                                     Constructor values                                     │
├─────┼──────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ 1   │ GovernanceToken (test AMUTT) │ "Test AMUTT", "tAMUTT", owner, owner, 1000000000000000000000000 (1 million at 18 decimals) │
├─────┼──────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ 2   │ FeeDiscountStaking           │ test-token address, owner, owner                                                           │
├─────┼──────────────────────────────┼───────────────────────────────────────────────────────────────┤
│ 3   │ WeeklyUsdcDistributor        │ 0x036C…CF7e, owner, 1792972800                                                             │
└─────┴──────────────────────────────┴───────────────────────────────────────────────────────────────┘

"Owner" means 0x9dC0a2E92cC1f08050D2c5F560A45229CcF4

The easiest way with MetaMask is Remix (remix.ethereles, set the compiler to 0.8.28, choose InjectedProvider – MetaMask, and deploy. That way your key never leaves MetaMask.

Then I create config/reward-deployment.base-sepolia.json with these addresses, their deployment blocks, the start time, and your wallet
as excluded. The mainnet settings file stays untouch

Upload three files, all from D:\shaggy-dogg-dex\contracts\src\:

┌───────────────────────────┬────────────────────────────────────────────────────────────────────────────┐
│           File            │                                   Notes                                    │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
│ GovernanceToken.sol       │ The test AMUTT token                                                       │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
│ FeeDiscountStaking.sol    │ Imports ./GovernanceToken.sol, so both must be in the same folder in Remix │
├───────────────────────────┼────────────────────────────────────────────────────────────────────────────┤
│ WeeklyUsdcDistributor.sol │ Needs no other files                                                       │
└───────────────────────────┴────────────────────────────────────────────────────────────────────────────┘

None of the three import anything else, so you don't need OpenZeppelin or any library.

In Remix
1. Upload: go to remix.ethereum.org. In the File explorer (top icon on the left), click the upload icon ("Load a local file into current workspace"). Select all three files at once so they land in the same folder.
2. Compiler (second icon on the left):
   - Version: 0.8.28 (all three files require exactly this).
   - Open Advanced Configurations, tick Enable optimization, and set runs to 200. This matches contracts/foundry.toml.
   - Leave the EVM version at its default.
   - Click Compile on each file. Each one should get a green check.
3. Deploy (third icon on the left):
   - Environment: Injected Provider – MetaMask. MetaMask must be on Base Sepolia with 0x9dC0…C98 selected.
   - In the Contract dropdown, pick each contract in turn and fill in the fields next to Deploy:

┌───────┬───────────────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Order │       Contract        │                                              Fields                                               │
├───────┼───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1     │ GovernanceToken       │ _name: Test AMUTT · _symbol: tAMUTT · _admin: 0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98 ·        │
│       │                       │ _minter: same address · initialMint: 1000000000000000000000000                                    │
├───────┼───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2     │ FeeDiscountStaking    │ tokenAddress: the address from #1 · _admin: 0x9dC0…C98 · _tierAdmin: 0x9dC0…C98                   │
├───────┼───────────────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3     │ WeeklyUsdcDistributor │ Base Sepolia USDC 0x036CbD53842c5426634e7929541eC2318f3dCF7e · 0x9dC0…C98 · 1792972800            │
└───────┴───────────────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘

For #3, I'm going by the argument order in the runbook. Remix shows each field's name when you click the small arrow next to Deploy; check they read USDC, owner, origin in that order.

After each deploy, copy the new address from Deployed Contracts at the bottom. Also copy the transaction's block number: click the transaction in the Remix console, or look it up on sepolia.basescan.org. Send me all three addresses and block numbers, and I'll create the test settings file.

