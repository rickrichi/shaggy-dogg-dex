#!/usr/bin/env node
/**
 * Block Fetcher Utility - Shaggy Dogg DEX
 * Fetches block information from any supported chain using project's RPC configuration
 *
 * Usage:
 *   npm run script:block                           # Latest mainnet block
 *   npm run script:block -- --chain base           # Latest base block
 *   npm run script:block -- --block 123456         # Specific mainnet block
 *   npm run script:block -- --chain arbitrum --block latest
 *
 * Environment:
 *   ALCHEMY_API_KEY - Optional Alchemy API key (falls back to public RPCs)
 */

import { type Chain,createPublicClient, http } from 'viem'
import { arbitrum, base, mainnet, optimism, polygon, sepolia } from 'viem/chains'

// ──────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────

type SupportedChainName = 'mainnet' | 'base' | 'arbitrum' | 'optimism' | 'polygon' | 'sepolia'

interface ScriptOptions {
  chain: SupportedChainName
  block: bigint | 'latest' | 'pending'
}

// ──────────────────────────────────────────────────────────────────────────
// CONFIGURATION (Aligned with src/wagmi.ts)
// ──────────────────────────────────────────────────────────────────────────

const SUPPORTED_CHAINS: Record<SupportedChainName, Chain> = {
  mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  sepolia,
} as const

const ALCHEMY_NETWORK: Record<SupportedChainName, string> = {
  mainnet: 'eth-mainnet',
  base: 'base-mainnet',
  arbitrum: 'arb-mainnet',
  optimism: 'opt-mainnet',
  polygon: 'polygon-mainnet',
  sepolia: 'eth-sepolia',
}

const PUBLIC_FALLBACK: Record<SupportedChainName, string | undefined> = {
  mainnet: 'https://eth.llamarpc.com',
  base: 'https://mainnet.base.org',
  arbitrum: 'https://arb1.arbitrum.io/rpc',
  optimism: 'https://mainnet.optimism.io',
  polygon: 'https://polygon-rpc.com',
  sepolia: 'https://rpc.sepolia.org',
}

// ──────────────────────────────────────────────────────────────────────────
// RPC CONFIGURATION
// ──────────────────────────────────────────────────────────────────────────

function buildAlchemyUrl(chainName: SupportedChainName): string | undefined {
  const apiKey = process.env.ALCHEMY_API_KEY
  if (!apiKey) return undefined

  const network = ALCHEMY_NETWORK[chainName]
  return `https://${network}.g.alchemy.com/v2/${apiKey}`
}

function getRpcUrl(chainName: SupportedChainName): string {
  const alchemy = buildAlchemyUrl(chainName)
  if (alchemy) return alchemy

  const fallback = PUBLIC_FALLBACK[chainName]
  if (!fallback) {
    throw new Error(`No RPC URL configured for chain: ${chainName}`)
  }

  return fallback
}

// ──────────────────────────────────────────────────────────────────────────
// CLI ARGUMENT PARSING
// ──────────────────────────────────────────────────────────────────────────

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2)
  const options: ScriptOptions = {
    chain: 'mainnet',
    block: 'latest',
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const nextArg = args[i + 1]

    if ((arg === '--chain' || arg === '-c') && nextArg) {
      if (!isSupportedChain(nextArg)) {
        throw new Error(
          `Unsupported chain: ${nextArg}\nSupported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}`
        )
      }
      options.chain = nextArg as SupportedChainName
      i++
    } else if ((arg === '--block' || arg === '-b') && nextArg) {
      if (nextArg === 'latest' || nextArg === 'pending') {
        options.block = nextArg
      } else {
        const blockNum = BigInt(nextArg)
        if (blockNum < 0n) {
          throw new Error(`Invalid block number: ${nextArg}`)
        }
        options.block = blockNum
      }
      i++
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
  }

  return options
}

function isSupportedChain(chainName: string): chainName is SupportedChainName {
  return chainName in SUPPORTED_CHAINS
}

function printUsage(): void {
  console.log(`
📦 Block Fetcher - Shaggy Dogg DEX

Usage:
  npm run script:block [options]

Options:
  -c, --chain <name>    Chain to query (default: mainnet)
                        Supported: ${Object.keys(SUPPORTED_CHAINS).join(', ')}

  -b, --block <number>  Block number, 'latest', or 'pending' (default: latest)

  -h, --help           Show this help message

Environment Variables:
  ALCHEMY_API_KEY      Optional Alchemy API key (uses public RPC if not set)

Examples:
  npm run script:block
  npm run script:block -- --chain base
  npm run script:block -- --chain arbitrum --block 123456
  npm run script:block -- --chain sepolia --block latest
  `)
}

// ──────────────────────────────────────────────────────────────────────────
// MAIN LOGIC
// ──────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const options = parseArgs()
  const chain = SUPPORTED_CHAINS[options.chain]
  const rpcUrl = getRpcUrl(options.chain)

  // Create viem client with same configuration as wagmi
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, {
      batch: true,
      retryCount: 3,
      retryDelay: 1000,
    }),
  })

  console.log(`\n🔗 Fetching block from ${chain.name}...`)
  console.log(`📡 RPC: ${rpcUrl.replace(/\/v2\/.*$/, '/v2/***')}`)

  try {
    const block = await client.getBlock({
      blockTag: typeof options.block === 'string' ? options.block : undefined,
      blockNumber: typeof options.block === 'bigint' ? options.block : undefined,
    })

    console.log(`\n✅ Block ${block.number}`)
    console.log('─'.repeat(80))
    console.log({
      number: block.number,
      hash: block.hash,
      timestamp: block.timestamp,
      timestampDate: new Date(Number(block.timestamp) * 1000).toISOString(),
      transactions: block.transactions.length,
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      baseFeePerGas: block.baseFeePerGas,
      miner: block.miner,
      extraData: block.extraData,
    })
    console.log('─'.repeat(80))

    if (block.transactions.length > 0) {
      console.log(`\n📝 First 3 transactions:`)
      block.transactions.slice(0, 3).forEach((tx, i) => {
        console.log(`  ${i + 1}. ${tx}`)
      })
      if (block.transactions.length > 3) {
        console.log(`  ... and ${block.transactions.length - 3} more`)
      }
    }

    console.log('')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch block: ${message}`)
  }
}

// ──────────────────────────────────────────────────────────────────────────
// ENTRYPOINT
// ──────────────────────────────────────────────────────────────────────────

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\n❌ Error: ${message}\n`)
  process.exit(1)
})
