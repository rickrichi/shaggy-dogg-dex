# Audit package

- `SCOPE.md`: contracts, addresses, build settings, trust assumptions, questions for auditors.
- `KNOWN-ISSUES.md`: self-assessment with tests that reproduce each issue.
- `ROUTER-REVIEW.md`: line-by-line self-review of the flash-arbitrage router.
- `SLITHER-TRIAGE.md`: every Slither result with a disposition.
- `slither-output.txt`: raw Slither output (static analysis, not an audit).
- `../SECURITY.md`: how to report a vulnerability.
- `../deployments/base-mainnet.manifest.json`: on-chain facts for every deployed contract.
- `../contracts/test/`: Foundry tests (76 passing).

## Reproduce

```bash
cd contracts
forge build
forge test                         # 76 tests; Base-fork tests use https://mainnet.base.org
forge coverage --report summary
# Static analysis (WSL or Linux with uv): 
uvx --python 3.12 --from slither-analyzer slither . --filter-paths "test|vendor|script|lib"
# On-chain inventory and verification status:
npx tsx scripts/inventory-deployments.ts <address-list-file>
```

Vulnerability reporting: see `../SECURITY.md`.
