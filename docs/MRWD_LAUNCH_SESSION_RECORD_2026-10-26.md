# Mutt Rewards (MRWD) launch: session record

**Covers:** 2026-10-22 to 2026-10-26 (one long working session)
**Written:** 2026-10-26
**Canonical addresses and transaction hashes:** `deployments/mrwd-base-mainnet.json`

---

## 1. Summary

Over this session Shaggy Dogg DEX:

- **Replaced the old token** with a new liquidity-rewards token, **Mutt Rewards ($MRWD)**: 1 trillion supply, minted once, no owner, no mint, no proxy.
- **Ran an open launchpad demand test** so launch activity can be measured before relying on it.
- **Rehearsed the full MRWD lifecycle on Base Sepolia**, with every balance matching exactly.
- **Launched MRWD on Base mainnet on 2026-10-25.** The launch liquidity is locked for 24 months, team and treasury tokens are vested, and 16 quarters of liquidity rewards are scheduled.
- **Connected MRWD to three products:**
  - the DEX app: token list and a Stake page;
  - the Lumsian-Pie store: Equilnyxs Pro unlocked free by staking 1 billion MRWD;
  - the Equilnyxs site: a Pricing card.
- **Verified all five MRWD contracts** on Sourcify (exact match).
- **Taught the market-data service to price Uniswap V3 pools**, so MRWD shows a real (indicative) price.
- **Backed up the store code** to a private GitHub repo.
- **Set up a daily keeper on GitHub Actions** that creates each quarter's rewards automatically, using a dedicated, funded keeper wallet.

---

## 2. Timeline

| Date (2026) | What happened |
|---|---|
| Oct 22 | White paper scanned. The old token's rewards rehearsal was paused and superseded. |
| Oct 23 | Decided to test launchpad demand first: launchpad opened to any wallet, no platform fee, fixed-supply token template, two-hop V3 routing. The old token was dropped entirely. |
| Oct 23–24 | MRWD designed: name and ticker, 1T supply, Uniswap V3 MRWD/WETH 0.30%, official UniswapV3Staker, an ownerless incentive scheduler, a ¼×–4× launch range, a 24-month lock. |
| Oct 24 | Short v1.4 white paper published. API moved to `api.lumsian.com` (Render). Launch records persisted in Supabase. Launch-success thresholds adopted (§17.1). |
| Oct 24 | Contracts built: `MuttRewards`, `MuttIncentiveScheduler` (16 quarters), `MuttVesting`, `MuttProStaking`, plus the emission-curve fix (commits `71a6f7d`, `275d7c5`). |
| Oct 25 | Base Sepolia rehearsal, four phases. Exact balances verified on chain (commit `82b862c`). |
| Oct 25 | **Base mainnet launch.** It stopped at the locker approval, and `FinishMrwdLaunch` completed it before quarter 1 started (commit `f2aa334`). |
| Oct 25 | Follow-ups: deployment record, white paper v2.0 draft updated, daily keeper workflow (`35e9324`), MRWD in the DEX and Pro staking (`4b6a37b`), store stake page, Equilnyxs Pricing card. |
| Oct 25 | Three production deploys: DEX frontend, store, Equilnyxs site. All verified live. |
| Oct 26 | Sourcify verification. Market-data service gains V3 pricing (`48c1b54` in the market-data repo). DEX market-data page updated (`8654635`). Store repo pushed to GitHub. |
| Oct 26 | Keeper wallet created and funded. GitHub secret added. Keeper now prints its address and gas on each run (`b32fb58`), and that was verified in run 40275270821. |

---

## 3. What is live on Base mainnet (chain 8453)

### Contracts

| Contract | Address |
|---|---|
| MRWD token (`MuttRewards`) | `0xC17227AAa33C54634B6cE7AD0bf33A156563c179` |
| Uniswap V3 pool MRWD/WETH 0.30% | `0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5` |
| Incentive scheduler | `0xCAbf284806b800d9A771B55857B9fCF735ea7109` |
| Treasury vesting | `0x7bC37041E1205841a83413625650EC12DA119697` |
| Team vesting | `0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1` |
| Pro staking (`MuttProStaking`) | `0x67dBC193bF510225EBf189ab25dC3b34a32c1766` |

External contracts used: the Uniswap V3 Staker `0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1`, and V3PositionTimelock `0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25`.

### Supply allocation (1,000,000,000,000 MRWD)

| Share | Amount | Where it went |
|---|---|---|
| 20% | 200B | Launch liquidity position, paired with 0.00306 ETH |
| 60% | 600B | Rewards reserve in the scheduler, released over 16 quarters |
| 15% | 150B | Treasury vesting → `0xB04A0b807BCD463351F90133242F0AcA15C2280f` |
| 5% | 50B | Team vesting → `0x88D67A5fEAafd4501B0E3510ebb3533b7d8245f2` |

After launch the signer `0x9dC0…C98` holds **0 MRWD**. Leftover rounding went to `0x…dEaD`.

### Launch liquidity position

- **Position:** Uniswap V3 position **#6351512**, range ¼× to 4× around the starting price (ticks 304260 to 331980).
- **Lock:** in V3PositionTimelock until **2028-10-24 23:11 UTC**. The lock owner is the deployer, `0x9dC0…C98`.

### Vesting (team and treasury)

- 12-month cliff, ending **2027-10-25 23:11 UTC**.
- Then linear release over 36 months, finishing **2030-10-24 23:11 UTC**.
- Anyone can trigger a release. The tokens always go to the beneficiary wallet.

### Rewards schedule

- 16 quarters of about 91 days each, starting 2026-10-26 00:07 UTC.
- **Quarter 1** (period 0) was created at launch: 55.45B MRWD, running until 2027-01-25 06:07 UTC.
- Each quarter can be created only within 30 days before it starts. Uniswap's staker sets that limit.
- A quarter nobody creates in time is sent to `0x…dEaD`. So are unclaimed rewards.
- Every scheduler action (`createIncentive`, `skipMissedPeriod`, `finalize`, `burnLeftover`) is permissionless and uses only the scheduler's own MRWD. The caller pays gas only.

### Pro staking

- **Stake:** 1,000,000,000 MRWD, with a 30-day lock per deposit.
- **What it unlocks:** Equilnyxs Pro for as long as the stake stays locked. The store issues a key that expires the day before the stake unlocks.

---

## 4. The launch

1. **Script.** `contracts/script/LaunchMrwd.s.sol` was a one-run launch:
   - The team and treasury wallets were hardcoded.
   - The paired ETH was the signer's balance minus a 0.0015 ETH gas reserve.
   - It ran with `--account mrwd-sepolia --sender 0x9dC0…C98 --broadcast --slow` from WSL.
2. **Why it stopped.** Forge computes every transaction's data during its simulation. The simulated mint returned position 6351507, but other people's mints landed first, so the real position was **6351512**. The locker approval for 6351507 then reverted, at a cost of gas only.
3. **The fix.** `contracts/script/FinishMrwdLaunch.s.sol` reads the real position from chain, checks that it holds MRWD and is owned by the signer, and then:
   - creates quarter 1;
   - locks the position for 730 days;
   - deploys and funds both vestings;
   - deploys Pro staking;
   - sends the leftover to `0x…dEaD`.

   It was dry-run first on a fork impersonating the real signer, and it completed before quarter 1's start time.
4. **Result.** All balances were verified on chain afterwards: signer 0, scheduler 544.55B, staker 55.45B (quarter 1), treasury vesting 150B, team vesting 50B.
5. **Lesson for next time.** Never use a value from a forge simulation that depends on other users' activity, such as NFT ids. Do mint-then-use atomically in a contract, or in a separate run that reads the id from chain. `LaunchMrwd.s.sol` now carries a "used once, do not reuse as written" note.

The Base Sepolia rehearsal (`script/RehearseMrwd.s.sol`, four phases, 2026-10-25) ran the whole lifecycle first. It used community position #83261, which earned 492,084.07 test MRWD. The final balances matched exactly, and total gas was about 0.00009 test ETH.

---

## 5. Product changes

### DEX app (dex.lumsian.com), repo `rickrichi/shaggy-dogg-dex`
- **Token list:** MRWD added to the Base token list and to the dropdown, after ETH (`src/config/tokens.ts`).
- **Stake page:** `/stake` now has the **MRWD Pro staking panel** (`src/components/MrwdProStakingPanel.tsx`). It covers approve and stake, relock all, withdraw matured deposits, and shows Pro status and its end date. Helpers and tests live in `src/lib/mrwd-pro.ts`. Commit `4b6a37b`, **live and verified**.
- **Market data page:** shows thin-pool prices with an "indicative · thin pool" label and adds a **Price MRWD** button. Commit `8654635`, pushed, **not yet deployed** (see §9).

### Store (www.lumsian.com/pro), repo `rickrichi/lumsian-pie` (private)
- **"Pro by staking MRWD":** at `https://www.lumsian.com/pro/stake.php`, the wallet signs a message. The store recovers the signer, reads `depositsOf` from Pro staking, and issues an EQX1 Pro key valid until the day before the stake unlocks.
- **Code:** `app/secp256k1.php` gained signature recovery; `app/mrwd.php`, `public/stake.php` and `public/stake-js.php` are new.
- **Tests:** checked against published test vectors (`tests/mrwd-test.php`), all passing.
- **Status:** commit `ea3a30b`. **Deployed and verified live.** Pushed to GitHub on 2026-10-26, after a full-history secret audit came back clean.

### Equilnyxs site (equilnyxs.lumsian.com)
- **Pricing card:** a green "Or get Pro free by staking MRWD" card, configured in `src/config/site.ts`. Commit `bf96866`, **deployed and verified live**.

### Market-data service (shaggy-dogg-market-data.onrender.com)
- **What changed:** it now reads **Uniswap V3** pools as well as V2 and Aerodrome. Prices come from `slot0`, and liquidity from the quote-token balance.
- **MRWD's price:** with `allowThin=true` the service returns an indicative price for pools under the $100 liquidity floor. MRWD currently prices at about $3.5e-11 from its roughly $14 pool, and becomes a firm price once the pool holds $100 or more.
- **Status:** commit `48c1b54`. 27 tests pass. Render auto-deployed it, and it was **verified live**.

### White paper (`docs/WHITEPAPER-v2.0-DRAFT.md`)
Updated to 25 October 2026:
- the launch paragraph;
- deployed addresses;
- the Equilnyxs Pro staking terms;
- scheduler status;
- vesting addresses;
- resolved decisions struck through;
- §4 on the V3 price feed.

The draft remains unpublished. The live paper is v1.4.

---

## 6. Keeper automation

- **Workflow:** `.github/workflows/mrwd-keeper.yml` runs daily at **07:41 UTC**, and also on demand ("Run workflow").
- **Logic:** `server/src/mrwd/keeper.ts` (6 tests) and `server/src/mrwd/run-keeper.ts`. The keeper:
  - creates a quarter once its window is open;
  - skips a missed quarter;
  - finalizes ended quarters that have nothing staked;
  - flags anything that needs a person.
- **Keeper wallet:** `0x5Fb98222c6010D6A3fCD3119372e82777282796f`. It was made with `cast wallet new`, and funded with **0.001 ETH** on Base from the deployer (tx `0x04d6f7f7ea2ddba5190127346283433c79031800a18c0f39a078a08800028574`). It only ever pays gas and never holds MRWD.
- **Secret:** `MRWD_KEEPER_PRIVATE_KEY` in the repo's Actions secrets, added 2026-10-26 05:33 UTC. The key exists nowhere else.
- **Verification:** since `b32fb58`, every send-mode run prints the keeper's address and gas balance. Run **40275270821** printed `Keeper 0x5Fb9…796f has 0.001 ETH for gas.`, which proves the secret is the right key.
- **Alerts:** a run turns red, and GitHub emails, if:
  - a transaction fails;
  - work needs a person;
  - the keeper's gas falls below **0.0002 ETH**.
- **If the key ever leaks:** delete the secret, create a new wallet, fund it, and add the new key. The most at risk is the leftover gas ETH.

---

## 7. Verification and backups

**Contracts.** All five MRWD contracts are verified on **Sourcify** as `exact_match`, meaning the deployed bytecode is identical to the source:
- https://repo.sourcify.dev/8453/0xC17227AAa33C54634B6cE7AD0bf33A156563c179
- https://repo.sourcify.dev/8453/0xCAbf284806b800d9A771B55857B9fCF735ea7109
- https://repo.sourcify.dev/8453/0x7bC37041E1205841a83413625650EC12DA119697
- https://repo.sourcify.dev/8453/0x6be3920f45Fe0836A3a29F40d8AA3f324E0610a1
- https://repo.sourcify.dev/8453/0x67dBC193bF510225EBf189ab25dC3b34a32c1766

Blockscout's API sits behind a Cloudflare challenge, so the Blockscout pages themselves weren't checked. Blockscout can import the source from Sourcify.

**Backups.**
- **Store:** private repo `rickrichi/lumsian-pie`, pushed 2026-10-26.
- **DEX, market-data and Equilnyxs repos:** all pushed to GitHub.

**Commit hygiene.** Every commit in this session was scanned for secrets before committing, and none carries Claude or Anthropic attribution.

---

## 8. Problems hit and how they were fixed

| Problem | Fix |
|---|---|
| Keystore import failed with "invalid string length" | Enter had been pressed without pasting the key. Right-click pastes, and the prompt shows nothing while you type. |
| Rehearsal reverted on the `msg.sender` check | Added `--sender 0x9dC0…C98`. |
| Rehearsal phases 2 and 4 run too early ("incentive not started", `PeriodNotEnded`) | Nothing was spent. Gave commands with wait-loops on exact unix times. |
| Launch script compile errors (checksum, stack too deep) | Moved state into storage and split the script into helpers. |
| A bash script broken by Windows CRLF line endings | Stripped the CRs. Scripts are now written with Unix line endings. |
| Template placeholders pasted literally | Hardcoded the real wallets in the script. |
| **Launch stopped at the locker approval (tokenId race)** | `FinishMrwdLaunch.s.sol`, dry-run on a fork first, completed it in time. |
| GitHub Actions passes an empty secret as `""` | Used `\|\|` instead of `??` for the fallback. |
| Vercel `deploy --prod` blocked for the assistant | Richard ran it in PowerShell. WSL had no Vercel login, and a stray `VERCEL_TOKEN` gave "Not authorized" until it was removed. |
| Equilnyxs push timed out on the user's side | Pushed from the assistant's side. Pushing doesn't publish that site: `deploy-godaddy.sh` does. |
| Blockscout verification behind Cloudflare | Used Sourcify instead, without bypassing the challenge. |
| Market-data service timed out at first | Render free-tier cold start. Retries succeeded. |
| Keeper funding: MetaMask on **Base Sepolia** twice | Test ETH only, nothing real lost. Switched to **Base** and the third send landed. Lesson: before confirming, check that the review screen says "Base", not just a dollar balance. |
| "Invalid address" in MetaMask | The shortened `0x5Fb9…796f` had been pasted; the full 42-character address fixed it. |
| `mrwd-sepolia` keystore password unknown | Funded from MetaMask instead. The deployer `0x9dC0…C98` is in MetaMask, so the 2028 unlock doesn't depend on the keystore. |
| Keeper only loaded its key when work was due | `b32fb58` checks the key on every run. |

---

## 9. Calendar and open items

### Dates (UTC)

| Date | Event | Who acts |
|---|---|---|
| **2026-12-26 06:07** | Quarter 2's creation window opens; the keeper creates it at 07:41 | Keeper |
| **2027-01-25 06:07** | Quarter 1 ends. **Quarter 2 must be created before this** or it is sent to `0x…dEaD` | Keeper; liquidity providers unstake to claim |
| Every ~3 months | Each later quarter's window opens 30 days before it starts | Keeper |
| **2027-10-25 23:11** | Vesting cliff ends; team and treasury MRWD start releasing | Anyone can trigger |
| **2028-10-24 23:11** | Launch liquidity position unlocks | Deployer (`0x9dC0…C98`), optional |
| 2030-06-25 → 2030-07-25 | Window for the 16th and last quarter | Keeper |
| **2030-10-24 23:11** | Vesting fully released | n/a |
| After the last quarter | `burnLeftover` sends any unused MRWD to `0x…dEaD` | Anyone, optional |

### Open items

- [ ] **DEX frontend deploy of `8654635`.** Run in PowerShell:
  `cd C:\Users\fbada\AppData\Local\Temp\claude\D--shaggy-dogg-dex\63588e48-8fd2-4f1a-b522-379b1a42dda8\scratchpad\deploy-8654635; npx --yes vercel@63.1.2 deploy --prod --yes`
  If that scratch folder is gone, re-export with `git archive origin/main`, copy `.vercel/project.json` in, and run the same deploy command there.
- [ ] Optional: stake 1B MRWD yourself as the first Pro-by-staking customer, to test the full path.
- [ ] Optional: add ETH to the MRWD/WETH pool. Its price becomes firm, rather than indicative, at $100 of liquidity.
- [ ] `deployments/mrwd-base-mainnet.json`: the `launchPosition.range` text has garbled characters (an encoding slip around "¼×–4×"). The addresses and numbers are unaffected.
- [ ] Launchpad demand test: the measurement window can open now that records persist in Supabase. Trading-per-launch measurement is not built yet.
- [ ] White paper v2.0 is still a draft. Publishing it is your call.
- [ ] How MRWD-for-Pro and a future EQX token coexist is still open. EQX is being kept.

---

## 10. How-to reference

| Task | How |
|---|---|
| Deploy the DEX frontend | Clean export: `git archive origin/main \| tar -x -C <dir>`, copy `.vercel/project.json` in, then run `npx --yes vercel@63.1.2 deploy --prod --yes` in PowerShell. Never deploy from the working folder. |
| Deploy the API | Merge `main` into `deploy/render` and push; Render auto-deploys. |
| Deploy the store | PowerShell: `& "C:\Program Files\Git\bin\bash.exe" C:/Users/fbada/source/repos/lumsian-pie/scripts/deploy.sh` |
| Deploy the Equilnyxs site | PowerShell: `& "C:\Program Files\Git\bin\bash.exe" D:/equilnyxs_site/scripts/deploy-godaddy.sh` |
| Market-data service | Push to `D:\shaggy-dogg-market-data`; Render auto-deploys. |
| Run the keeper by hand | https://github.com/rickrichi/shaggy-dogg-dex/actions/workflows/mrwd-keeper.yml, then **Run workflow** |
| Create a quarter by hand (fallback) | WSL: `cast send 0xCAbf284806b800d9A771B55857B9fCF735ea7109 "createIncentive(uint256)" <period> --account <keystore> --rpc-url https://mainnet.base.org`. Quarter 2 is period `1`. It fails harmlessly outside the window. |
| Foundry | Run only in WSL, from the C: copy at `C:\Users\fbada\mrwd-rehearsal\contracts`. WSL can't reach D:. |
| Verify a contract | `forge verify-contract --verifier sourcify --guess-constructor-args --rpc-url https://mainnet.base.org --watch <address> <Contract>` |
