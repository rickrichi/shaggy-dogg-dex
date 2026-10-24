import { keccak256, size, zeroAddress, type Hex } from 'viem'
import { describe, expect, it } from 'vitest'

import { chain, creationInput, CREATOR, HASH, POOL, TEMPLATE, TOKEN } from './fixtures.js'
import {
  BASE_V3_FACTORY,
  BASE_WETH,
  FIXED_SUPPLY_TOKEN_CREATION,
  LAUNCH_POOL_FEE,
  LaunchVerificationError,
  verifyLaunch,
} from './verify.js'

describe('launch verification', () => {
  it('pins the template to the compiled FixedSupplyToken creation bytecode', () => {
    expect(size(TEMPLATE)).toBe(FIXED_SUPPLY_TOKEN_CREATION.size)
    expect(keccak256(TEMPLATE)).toBe(FIXED_SUPPLY_TOKEN_CREATION.keccak256)
  })

  it('reads a launch of the template from the chain, including its 1% WETH pool', async () => {
    const { client, readContract } = chain()
    await expect(verifyLaunch(client, HASH)).resolves.toEqual({
      txHash: HASH,
      tokenAddress: TOKEN,
      creator: CREATOR,
      recipient: CREATOR,
      name: 'Mutt Test',
      symbol: 'MTT',
      supply: 10n ** 27n,
      blockNumber: 123n,
      launchedAt: 1_790_000_000,
      poolAddress: POOL,
    })
    expect(readContract.mock.calls[0]![0]).toMatchObject({
      address: BASE_V3_FACTORY,
      args: [BASE_WETH, TOKEN, LAUNCH_POOL_FEE],
    })
  })

  it('records a launch with no pool as unseeded', async () => {
    await expect(verifyLaunch(chain({ pool: zeroAddress }).client, HASH)).resolves.toMatchObject({
      poolAddress: null,
    })
  })

  it.each([
    ['a call to an existing contract', { to: TOKEN as Hex }, 'not_contract_creation'],
    ['a different contract', { input: creationInput(`${TEMPLATE.slice(0, -2)}00` as Hex) }, 'not_launchpad_template'],
    ['bare template code with no constructor arguments', { input: TEMPLATE }, 'not_launchpad_template'],
    ['a reverted deployment', { status: 'reverted' as const }, 'reverted'],
  ])('rejects %s', async (_label, overrides, reason) => {
    const error = await verifyLaunch(chain(overrides).client, HASH).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(LaunchVerificationError)
    expect((error as LaunchVerificationError).reason).toBe(reason)
  })
})
