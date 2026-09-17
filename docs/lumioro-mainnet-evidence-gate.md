# LUMIORO Ethereum Mainnet evidence gate

The release is BLOCKED and execution is DISABLED. The new release object records
the Ethereum L1 LUMIORO deployment at
0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E and its deployment transaction
0x0ec287f5fb036f12e68559be1b9a47244553807962e12787d5daee28ca90a201.

The companion repository's deployment record reports 20 of 20 repository
verification checks and the runtime SHA-256
0x60df844cb24eebe0468c53a079a326d77f6769ee75905760ecf9602a2622e696.
This is deployment evidence, not listing or execution permission.

The current liquidity policy permits review plans with exactly 250,000,000
LUMIORO and a selected WETH amount from 0.02 through 22.5 ETH. There is no
default amount. First-pair review plans use zero slippage, so their minimums are
the desired values.

The remaining blocks are explorer source publication, an audit report linked to
the exact audited source/bytecode, a named human review of one plan key, and the
intentional absence of mainnet submission code. Tanaka Minato is recorded as the
owner-identified auditor, but no report, scope, source commit, digest, or signed
verdict was found in the local repository, so the audit is ASSERTED_REPORT_NOT_LINKED
rather than passed or failed.

Read-only evidence output:

~~~powershell
npx tsx scripts/print-lumioro-mainnet-evidence.ts
npx vitest run src/lib/amm/lumioro-evidence-gate.test.ts --reporter=dot
~~~
