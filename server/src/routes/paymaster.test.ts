import { describe, expect, it } from 'vitest'

import { accountEntryPointMismatch } from './paymaster.js'

const METAMASK = '0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B'
const SIMPLE_7702 = '0xe6Cae83BdE06E4c305530e199D7217f42808555B'
const V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
const V08 = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'

describe('accountEntryPointMismatch', () => {
  it('accepts accounts whose EntryPoint matches the paymaster', () => {
    expect(accountEntryPointMismatch(METAMASK, V07)).toBeNull()
    expect(accountEntryPointMismatch(SIMPLE_7702.toLowerCase(), V08)).toBeNull()
  })

  it('refuses Simple 7702 (v0.8) accounts on the live v0.7 paymaster before signing', () => {
    const reason = accountEntryPointMismatch(SIMPLE_7702, V07)
    expect(reason).toContain('EntryPoint v0.8')
    expect(reason).toContain('reward paymaster uses v0.7')
    expect(reason).toContain('MetaMask Smart Account')
  })

  it('keeps the upgrade guidance for MetaMask accounts on a v0.8 paymaster', () => {
    expect(accountEntryPointMismatch(METAMASK, V08)).toContain('Upgrade Paymaster for MetaMask (v0.7)')
  })
})
