# Audit package

- `SCOPE.md`: contracts, addresses, build settings, trust assumptions, questions for auditors.
- `KNOWN-ISSUES.md`: self-assessment with tests that reproduce each issue.
- `slither-output.txt`: raw Slither output (static analysis, not an audit).
- `../deployments/base-mainnet.manifest.json`: on-chain facts for every deployed contract.
- `../contracts/test/`: Foundry tests (54 passing).

## Reproduce

```bash
cd contracts
forge build
forge test                         # 54 tests; Base-fork tests use https://mainnet.base.org
forge coverage --report summary
# Static analysis (WSL or Linux with uv): 
uvx --python 3.12 --from slither-analyzer slither . --filter-paths "test|vendor|script|lib"
# On-chain inventory and verification status:
npx tsx scripts/inventory-deployments.ts <address-list-file>
```

Security contact and disclosure terms are not defined yet; add them before inviting external review.
