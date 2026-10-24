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
 * Creation bytecode of contracts/src/FixedSupplyToken.sol (solc 0.8.28, Foundry), the template the
 * launchpad deploys. verify.test.ts checks these against contracts/out so they cannot drift.
 */
export const FIXED_SUPPLY_TOKEN_CREATION = {
  size: 2600,
  keccak256: '0x692f7e5f4b857445a6e22d663952e5cf67e68fad45b0403a89c2ee436d8f9343' as Hex,
} as const

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
  const { size: codeSize, keccak256: codeHash } = FIXED_SUPPLY_TOKEN_CREATION
  if (size(tx.input) <= codeSize || keccak256(slice(tx.input, 0, codeSize)) !== codeHash) {
    throw new LaunchVerificationError('not_launchpad_template')
  }
  const [name, symbol, recipient, supply] = decodeAbiParameters(CONSTRUCTOR, slice(tx.input, codeSize))

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
