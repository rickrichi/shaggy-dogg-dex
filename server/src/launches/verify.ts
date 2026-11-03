// server/src/launches/verify.ts
// Confirms on Base that a transaction deployed the launchpad's FixedSupplyToken template, and reads
// what was launched from the chain itself. A client can withhold a launch but cannot invent one.

import {
  type Address,
  decodeAbiParameters,
  type Hash,
  type Hex,
  keccak256,
  parseAbi,
  type PublicClient,
  size,
  slice,
  zeroAddress,
} from 'viem'

/**
 * Creation bytecode of contracts/src/FixedSupplyToken.sol (solc 0.8.28, Foundry, built without
 * remappings), the template the launchpad deploys. verify.test.ts checks the current build against
 * contracts/out so it cannot drift.
 */
export const FIXED_SUPPLY_TOKEN_CREATION = {
  size: 2688,
  keccak256: '0x79c0fdb5ead4387a0654d300cdc9f5bdd4d44308fb256d5e860fbeefd31e1662' as Hex,
} as const

/**
 * Every template build a launch may use. Earlier builds stay listed so a visitor whose browser still
 * runs the previous site version is counted too.
 */
export const FIXED_SUPPLY_TOKEN_TEMPLATES: readonly { size: number; keccak256: Hex }[] = [
  FIXED_SUPPLY_TOKEN_CREATION,
  // Before 2026-11-02: no block on transfers to the token contract itself.
  { size: 2600, keccak256: '0x692f7e5f4b857445a6e22d663952e5cf67e68fad45b0403a89c2ee436d8f9343' },
]

export const BASE_WETH: Address = '0x4200000000000000000000000000000000000006'
export const BASE_V3_FACTORY: Address = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD'
/** Fee tier the launchpad seeds launched tokens into (deployEngine.ts). */
export const LAUNCH_POOL_FEE = 10_000

const FACTORY_ABI = parseAbi(['function getPool(address,address,uint24) view returns (address)'])
const CONSTRUCTOR = [
  { type: 'string' },
  { type: 'string' },
  { type: 'address' },
  { type: 'uint256' },
] as const

/** The reads verification needs, typed to the fields it uses so any Base client satisfies it. */
export interface LaunchChainReader {
  getTransaction(args: { hash: Hash }): Promise<{ from: Address; to: Address | null; input: Hex }>
  getTransactionReceipt(args: {
    hash: Hash
  }): Promise<{ status: 'success' | 'reverted'; contractAddress?: Address | null | undefined; blockNumber: bigint }>
  getBlock(args: { blockNumber: bigint }): Promise<{ timestamp: bigint }>
  readContract: PublicClient['readContract']
}

export interface VerifiedLaunch {
  txHash: Hash
  tokenAddress: Address
  creator: Address
  recipient: Address
  name: string
  symbol: string
  supply: bigint
  blockNumber: bigint
  launchedAt: number
  poolAddress: Address | null
}

export type LaunchRejection = 'not_contract_creation' | 'not_launchpad_template' | 'reverted'

export class LaunchVerificationError extends Error {
  constructor(readonly reason: LaunchRejection) {
    super(reason)
  }
}

export async function verifyLaunch(client: LaunchChainReader, txHash: Hash): Promise<VerifiedLaunch> {
  const tx = await client.getTransaction({ hash: txHash })
  if (tx.to !== null) throw new LaunchVerificationError('not_contract_creation')
  const template = FIXED_SUPPLY_TOKEN_TEMPLATES.find(
    ({ size: codeSize, keccak256: codeHash }) =>
      size(tx.input) > codeSize && keccak256(slice(tx.input, 0, codeSize)) === codeHash,
  )
  if (!template) throw new LaunchVerificationError('not_launchpad_template')
  const [name, symbol, recipient, supply] = decodeAbiParameters(CONSTRUCTOR, slice(tx.input, template.size))

  const receipt = await client.getTransactionReceipt({ hash: txHash })
  if (receipt.status !== 'success' || !receipt.contractAddress) {
    throw new LaunchVerificationError('reverted')
  }
  const tokenAddress = receipt.contractAddress
  const [block, pool] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }),
    client.readContract({
      address: BASE_V3_FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getPool',
      args: [BASE_WETH, tokenAddress, LAUNCH_POOL_FEE],
    }),
  ])
  return {
    txHash,
    tokenAddress,
    creator: tx.from,
    recipient,
    name,
    symbol,
    supply,
    blockNumber: receipt.blockNumber,
    launchedAt: Number(block.timestamp),
    poolAddress: pool === zeroAddress ? null : pool,
  }
}
