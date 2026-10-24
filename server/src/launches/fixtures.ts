// Shared fixtures for the launch-tracking tests: a real template deployment input and a mocked Base reader.
import { readFileSync } from 'node:fs'

import { concat, encodeAbiParameters, type Hex } from 'viem'
import { vi } from 'vitest'

import type { LaunchChainReader } from './verify.js'

const artifact = JSON.parse(
  readFileSync(new URL('../../../contracts/out/FixedSupplyToken.sol/FixedSupplyToken.json', import.meta.url), 'utf8'),
) as { bytecode: { object: Hex } }
export const TEMPLATE = artifact.bytecode.object
export const CREATOR = '0x00000000000000000000000000000000000c0ffe'
export const TOKEN = '0x000000000000000000000000000000000000beef'
export const POOL = '0x0000000000000000000000000000000000000f00'
export const HASH = `0x${'ab'.repeat(32)}` as const

export const creationInput = (code: Hex = TEMPLATE) =>
  concat([
    code,
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'string' }, { type: 'address' }, { type: 'uint256' }],
      ['Mutt Test', 'MTT', CREATOR, 10n ** 27n],
    ),
  ])

export function chain(overrides: { to?: Hex | null; input?: Hex; status?: 'success' | 'reverted'; pool?: Hex } = {}) {
  const readContract = vi.fn().mockResolvedValue(overrides.pool ?? POOL)
  const client = {
    getTransaction: vi.fn().mockResolvedValue({
      from: CREATOR,
      to: overrides.to === undefined ? null : overrides.to,
      input: overrides.input ?? creationInput(),
    }),
    getTransactionReceipt: vi.fn().mockResolvedValue({
      status: overrides.status ?? 'success',
      contractAddress: TOKEN,
      blockNumber: 123n,
    }),
    getBlock: vi.fn().mockResolvedValue({ timestamp: 1_790_000_000n }),
    readContract,
  }
  return { client: client as unknown as LaunchChainReader, readContract }
}
