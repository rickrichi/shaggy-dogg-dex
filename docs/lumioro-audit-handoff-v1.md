# LUMIORO Mainnet Audit Handoff v1

Status: PREPARED_FOR_INDEPENDENT_REVIEW

This document is an audit handoff package. It is not an audit report and does not assert a passing verdict.

## Release freeze requirement

Before sharing a final scope, freeze the LUMIORO contract repository at a clean commit. At the latest check, the repository was not clean and no audit tag was present, so no tag was created.

Run these commands from the LUMIORO contract repository after resolving or intentionally committing the existing work:

    git status --short
    git rev-parse HEAD
    git tag lumioro-mainnet-audit-v1

Record the resulting commit in the final report. The contract source, compiler configuration, lockfiles, constructor arguments, and deployment procedure must not change after the audit tag without a documented delta review.

## Deployment and intended launch scope

- Contract: LUMIOROToken
- Contract address: 0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E
- Deployment transaction: 0x0ec287f5fb036f12e68559be1b9a47244553807962e12787d5daee28ca90a201
- Network: Ethereum Mainnet, chain ID 1
- Deployment source commit: ef6ef651999c17289b26ebc29b36acd50f8f6fb7
- Expected deployed runtime-bytecode SHA-256: 0x60df844cb24eebe0468c53a079a326d77f6769ee75905760ecf9602a2622e696
- Compiler: Solidity 0.8.36
- Optimizer: enabled, 200 runs
- Planned venue: Uniswap V2 LUMIORO/WETH liquidity

## Materials to provide the independent reviewer

- Exact audited Git commit and audit tag.
- Complete source tree and dependency lockfiles.
- Solidity compiler version, optimizer settings, and all relevant build configuration.
- Constructor arguments and deployment procedure.
- Existing tests, coverage, invariants, and known limitations.
- Token behavior specification, privileged roles, and authority-transfer or renouncement plan.
- Contract address, deployment transaction, chain ID, and the expected runtime digest above.
- Any remediation commits and their reviewed delta.

## Required review scope

The reviewer should cover at least:

- Supply, minting, burning, and transfer behavior.
- Allowances, approval flows, and permit or signature logic when present.
- Owner and administrator powers, pausing, blacklisting, taxes, limits, and upgradeability.
- Reentrancy, external calls, access control, and privilege loss.
- Uniswap V2 compatibility, fee-on-transfer behavior, and malicious-token interactions.
- Source/deployment equivalence and compiler reproducibility.
- Tests for each material invariant and exploit path.

## Evidence acceptance rule

The release gate treats an audit as passing only when a final report supplies a real HTTPS URL, a SHA-256 digest, the scoped 40-character Git commit, an auditor identity, a final verdict, and the exact deployed runtime-bytecode digest. An asserted name without this evidence remains blocked.

Use docs/lumioro-audit-final-record-template.md to preserve the returned report evidence.
