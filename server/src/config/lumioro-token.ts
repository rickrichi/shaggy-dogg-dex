/**
 * Canonical LUMIORO and USDC address pins for the CeDeFi bridge.
 *
 * SOURCE OF TRUTH: `chain/lib/networks.mjs` in the lumioro registry repository.
 * These values are mirrored here rather than imported because the server
 * package compiles with `rootDir: "src"` and cannot reach
 * `src/config/amm/lumioro-mainnet-release.ts` across the package boundary. The
 * two must agree; update this file whenever that one moves.
 *
 * A null address is a pinned fact, not missing configuration. `networks.mjs`
 * records `lumioroToken: null` for Base Mainnet deliberately, so that every
 * consumer fails closed instead of substituting a guess. Callers must treat
 * null as "not deployed on this chain" and refuse — never fall back to another
 * chain's address. Filing a chain-1 address under a Base-chain key is exactly
 * the defect this file was written to remove.
 */

export const LUMIORO_TOKEN = {
  symbol: 'LUMIORO',
  decimals: 18,
  /**
   * Ethereum Mainnet, chain 1. The deployed token, independently reviewed by
   * Tanaka Minato on 2026-09-19 (verdict PASS) against source commit
   * 7f359ab44a8636632ea8d07e36ba3a174271d26c.
   */
  ethereumMainnet: '0x14eDBa263054b381A3836d97Ba2e3Fe763f7991E',
  /**
   * Base Mainnet, chain 8453. LUMIORO is NOT deployed here and this is pinned
   * null on purpose. Do not populate it with the chain-1 address.
   */
  baseMainnet: null,
  /** Base Sepolia, chain 84532. */
  baseSepolia: '0x23297A5062F8a99049A89cfe8A5acb2A3b4a8729',
} as const;

export const USDC_TOKEN = {
  symbol: 'USDC',
  decimals: 6,
  /** Base Mainnet, chain 8453. Native Circle USDC — genuinely a Base address. */
  baseMainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
} as const;
