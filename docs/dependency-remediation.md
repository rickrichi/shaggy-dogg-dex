# Dependency remediation — October 3, 2026

Root audit: **86 → 14 advisories**, with critical advisories **5 → 0**.
`npm audit --omit=dev`: **zero**. The separate `server` project audits clean.
Type checks and frontend/server tests pass after the updates.
The packaged Python backend environment also passes pip-audit with no known vulnerabilities.

Applied compatible dependency updates, patched transitive versions of
brace-expansion, decode-uri-component, uuid and ws, and migrated React Router
to 7.18.4 with its corresponding imports/router props. Tailwind typography is
correctly classified as build tooling; its output is compiled CSS.

## Remaining upstream issues

The remaining 14 high entries are dependency paths to two advisories:

| Package | Issue | Where used | Published patch at check time |
| --- | --- | --- | --- |
| braces 3.0.3 | [Deeply nested patterns exhaust the stack](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Tailwind 3, fast-glob/micromatch, ESLint Tailwind plugin | None |
| http-cache-semantics 4.2.0 | [max-stale cache handling can expose cross-user responses](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) | Electron builder downloader through got/cacheable-request | None |

These are not suppressed or described as fixed. Do not feed untrusted patterns
to the build tools or use their HTTP cache for authenticated, cross-user traffic.
The application does not use these packages at runtime. Production release
packaging fails while high/critical advisories remain.

Removing these dependency paths requires a Tailwind 4/style-tool migration and
a packaging/downloader change, or upstream fixes. A blanket forced upgrade is
not sufficient: changing the major framework can alter the interface, and the
audit's suggested builder version does not prove its downloader is patched.
Keep the affected lockfile versions visible until a tested replacement exists.

Recheck with:

```powershell
npm audit
npm audit --omit=dev
npm --prefix server audit
npm run type-check
npm test -- --run
npm --prefix server test
```
