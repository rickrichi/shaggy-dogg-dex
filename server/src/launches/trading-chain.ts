// server/src/launches/trading-chain.ts
// TradingChainReader backed by a viem client. Public Base RPCs cap how many blocks one eth_getLogs
// call may span, so logs are read in chunks that shrink when the node refuses a range.

import { type Address, type Hash, parseAbi, parseAbiItem, type PublicClient, zeroAddress } from 'viem'

import { BASE_V3_FACTORY } from './verify.js'

import type { PoolMint, PoolSwap, TradingChainReader } from './trading.js'

const FACTORY_ABI = parseAbi(['function getPool(address,address,uint24) view returns (address)'])
const SWAP = parseAbiItem(
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
)
const MINT = parseAbiItem(
  'event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)',
)

/** Typed to the fields used, like verify.ts, so any Base client (including OP Stack ones) satisfies it. */
interface LogClient extends Pick<PublicClient, 'getBlockNumber' | 'getLogs' | 'readContract'> {
  getTransaction(args: { hash: Hash }): Promise<{ from: Address }>
}

export interface ChunkOptions {
  /** Blocks per eth_getLogs call to start with. */
  initialSpan?: bigint
  /** Below this span a refused range is a real error, not a size limit. */
  minSpan?: bigint
  /** Pause before retrying a refused call; public RPCs also refuse when rate limited. */
  retryDelayMs?: number
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Reads [from, to] in consecutive chunks, halving the chunk size whenever a call fails. */
export async function readChunked<T>(
  from: bigint,
  to: bigint,
  read: (from: bigint, to: bigint) => Promise<T[]>,
  { initialSpan = 10_000n, minSpan = 250n, retryDelayMs = 1_000 }: ChunkOptions = {},
): Promise<T[]> {
  const out: T[] = []
  let span = initialSpan
  let start = from
  while (start <= to) {
    const end = start + span - 1n < to ? start + span - 1n : to
    try {
      out.push(...(await read(start, end)))
      start = end + 1n
    } catch (error) {
      if (span <= minSpan) throw error
      span /= 2n
      await sleep(retryDelayMs)
    }
  }
  return out
}

export function viemTradingReader(client: LogClient, chunks: ChunkOptions = {}): TradingChainReader {
  return {
    latestBlock: () => client.getBlockNumber(),

    async poolFor(tokenA, tokenB, fee) {
      const pool = await client.readContract({
        address: BASE_V3_FACTORY,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenA, tokenB, fee],
      })
      return pool === zeroAddress ? null : pool
    },

    swaps: (pool: Address, fromBlock: bigint, toBlock: bigint) =>
      readChunked(
        fromBlock,
        toBlock,
        async (from, to): Promise<PoolSwap[]> => {
          const logs = await client.getLogs({ address: pool, event: SWAP, fromBlock: from, toBlock: to, strict: true })
          return logs.map((log) => ({
            blockNumber: log.blockNumber,
            txHash: log.transactionHash,
            amount0: log.args.amount0,
            amount1: log.args.amount1,
            sqrtPriceX96: log.args.sqrtPriceX96,
          }))
        },
        chunks,
      ),

    mints: (pool: Address, fromBlock: bigint, toBlock: bigint) =>
      readChunked(
        fromBlock,
        toBlock,
        async (from, to): Promise<PoolMint[]> => {
          const logs = await client.getLogs({ address: pool, event: MINT, fromBlock: from, toBlock: to, strict: true })
          return logs.map((log) => ({ blockNumber: log.blockNumber, amount0: log.args.amount0, amount1: log.args.amount1 }))
        },
        chunks,
      ),

    async txSender(txHash: Hash) {
      return (await client.getTransaction({ hash: txHash })).from
    },
  }
}
