import type { Hono } from 'hono'
import { z } from 'zod'
import {
  concat, createPublicClient, decodeFunctionData, encodeAbiParameters, getAddress,
  isAddress, keccak256, parseAbi, toHex, http, type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { recoverAuthorizationAddress } from 'viem/utils'

import type { Env } from '../env.js'

const entryPoint = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as const
const implementation = '0xe6Cae83BdE06E4c305530e199D7217f42808555B' as const
const mrwd = '0xC17227AAa33C54634B6cE7AD0bf33A156563c179' as const
const designator = `0xef0100${implementation.slice(2).toLowerCase()}`
const hex = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/)
const address = z.string().refine(isAddress, 'Invalid address')
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/)
const authorizationSchema = z.object({
  address, chainId: z.number().int(), nonce: uint,
  r: hex, s: hex, yParity: z.union([z.literal(0), z.literal(1)]),
})
const signSchema = z.object({
  sender: address, nonce: uint, callData: hex,
  factory: address.optional(), factoryData: hex.optional(),
  callGasLimit: uint, verificationGasLimit: uint, preVerificationGas: uint,
  maxFeePerGas: uint, maxPriorityFeePerGas: uint,
  paymasterVerificationGasLimit: uint, paymasterPostOpGasLimit: uint,
  authorization: authorizationSchema.optional(),
})
const accountAbi = parseAbi(['function execute(address target, uint256 value, bytes data)'])
const transferAbi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])
const paymasterAbi = parseAbi([
  'function sponsorSigner() view returns (address)',
  'function rewardToken() view returns (address)',
  'function rewardAmount() view returns (uint256)',
  'function maxCostPerOp() view returns (uint256)',
  'function cooldownSeconds() view returns (uint32)',
  'function lastSponsoredAt(address) view returns (uint256)',
  'function paused() view returns (bool)',
  'function availableRewards() view returns (uint256)',
])
const typehash = keccak256(toHex('Sponsorship(address paymaster,uint256 chainId,address sender,uint256 nonce,bytes32 initCodeHash,bytes32 callDataHash,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,uint128 paymasterVerificationGasLimit,uint128 paymasterPostOpGasLimit,uint48 validUntil,uint256 rewardAmount)'))
const allowedRpcMethods = new Set([
  'eth_supportedEntryPoints', 'eth_estimateUserOperationGas', 'eth_sendUserOperation',
  'eth_getUserOperationReceipt', 'eth_getUserOperationByHash',
])

function uint128(value: bigint, label: string): bigint {
  if (value > (1n << 128n) - 1n) throw new Error(`${label} exceeds uint128`)
  return value
}

function packGas(upper: bigint, lower: bigint): Hex {
  return toHex((uint128(upper, 'gas') << 128n) | uint128(lower, 'gas'), { size: 32 })
}

export function mountPaymasterRoutes(app: Hono, config: Env): void {
  const client = createPublicClient({ chain: base, transport: http(config.BASE_RPC_URL) })
  const paymaster = config.PAYMASTER_ADDRESS ? getAddress(config.PAYMASTER_ADDRESS) : undefined
  const signer = config.PAYMASTER_SIGNER_PRIVATE_KEY
    ? privateKeyToAccount(config.PAYMASTER_SIGNER_PRIVATE_KEY as Hex)
    : undefined
  const allowedWallets = new Set(config.PAYMASTER_ALLOWED_WALLETS)
  const ready = Boolean(paymaster && signer && config.PAYMASTER_BUNDLER_URL && allowedWallets.size)

  app.get('/api/paymaster/config', (c) => c.json({
    ready, chainId: base.id, entryPoint, paymaster: paymaster ?? null,
    accountImplementation: implementation,
    walletEligible: allowedWallets.has((c.req.query('wallet') ?? '').toLowerCase()),
  }))

  app.post('/api/paymaster/bundler', async (c) => {
    if (!ready || !config.PAYMASTER_BUNDLER_URL) return c.json({ error: 'Paymaster is not configured' }, 503)
    const body = await c.req.json().catch(() => null) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) return c.json({ error: 'Invalid RPC request' }, 400)
    const rpc = body as Record<string, unknown>
    if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string' || !allowedRpcMethods.has(rpc.method) ||
      !Array.isArray(rpc.params) || JSON.stringify(body).length > 40_000) {
      return c.json({ error: 'RPC method is not allowed' }, 400)
    }
    if (rpc.method === 'eth_sendUserOperation' || rpc.method === 'eth_estimateUserOperationGas') {
      const operation = rpc.params[0]
      const requestedEntryPoint = rpc.params[1]
      if (!operation || typeof operation !== 'object' || Array.isArray(operation) ||
        !('sender' in operation) || typeof operation.sender !== 'string' ||
        !allowedWallets.has(operation.sender.toLowerCase()) ||
        typeof requestedEntryPoint !== 'string' ||
        requestedEntryPoint.toLowerCase() !== entryPoint.toLowerCase()) {
        return c.json({ error: 'User operation is not eligible' }, 403)
      }
    }
    try {
      const response = await fetch(config.PAYMASTER_BUNDLER_URL, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      })
      return new Response(response.body, {
        status: response.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    } catch {
      return c.json({ error: 'Bundler unavailable' }, 502)
    }
  })

  app.post('/api/paymaster/sign', async (c) => {
    if (!ready || !paymaster || !signer) return c.json({ error: 'Paymaster is not configured' }, 503)
    const parsed = signSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid sponsorship request' }, 400)
    const op = parsed.data
    const sender = getAddress(op.sender)
    if (!allowedWallets.has(sender.toLowerCase())) return c.json({ error: 'Wallet is not eligible' }, 403)

    try {
      const senderCode = await client.getBytecode({ address: sender })
      if (senderCode?.toLowerCase() !== designator) {
        if (senderCode && senderCode !== '0x') throw new Error('Wallet uses a different account implementation')
        if (!op.authorization) throw new Error('EIP-7702 authorization is required')
        const auth = op.authorization
        if (getAddress(auth.address) !== implementation || auth.chainId !== base.id) {
          throw new Error('Authorization targets the wrong chain or account implementation')
        }
        const recovered = await recoverAuthorizationAddress({
          authorization: {
            address: getAddress(auth.address), chainId: auth.chainId,
            nonce: Number(auth.nonce), r: auth.r as Hex, s: auth.s as Hex, yParity: auth.yParity,
          },
        })
        if (recovered.toLowerCase() !== sender.toLowerCase()) throw new Error('Authorization signer mismatch')
        const currentNonce = await client.getTransactionCount({ address: sender })
        if (BigInt(auth.nonce) !== BigInt(currentNonce)) throw new Error('Authorization nonce is stale')
      }

      const accountCall = decodeFunctionData({ abi: accountAbi, data: op.callData as Hex })
      if (accountCall.functionName !== 'execute') throw new Error('Only single token transfers are eligible')
      const [token, value, tokenCallData] = accountCall.args
      if (value !== 0n || !isAddress(token)) throw new Error('Only ERC-20 transfers are eligible')
      const transferCall = decodeFunctionData({ abi: transferAbi, data: tokenCallData })
      if (transferCall.functionName !== 'transfer') throw new Error('Only ERC-20 transfers are eligible')
      const [recipient, amount] = transferCall.args
      if (amount <= 0n || recipient.toLowerCase() === sender.toLowerCase()) {
        throw new Error('Transfer amount and recipient must be valid')
      }
      const balance = await client.readContract({ address: token, abi: transferAbi, functionName: 'balanceOf', args: [sender] })
      if (balance < amount) throw new Error('Insufficient portfolio token balance')

      const [onchainSigner, rewardToken, rewardAmount, maxCost, cooldown, lastSponsoredAt, paused, available] = await Promise.all([
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'sponsorSigner' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'rewardToken' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'rewardAmount' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'maxCostPerOp' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'cooldownSeconds' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'lastSponsoredAt', args: [sender] }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'paused' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'availableRewards' }),
      ])
      if (onchainSigner.toLowerCase() !== signer.address.toLowerCase()) throw new Error('Sponsor signer does not match contract')
      if (rewardToken.toLowerCase() !== mrwd.toLowerCase()) throw new Error('Configured paymaster does not reward MRWD')
      if (paused || available < rewardAmount) throw new Error('Reward program is paused or unfunded')
      const now = Math.floor(Date.now() / 1000)
      if (lastSponsoredAt > 0n && BigInt(now) < lastSponsoredAt + BigInt(cooldown)) {
        throw new Error('Wallet is in its sponsorship cooldown')
      }
      const callGas = BigInt(op.callGasLimit)
      const verificationGas = BigInt(op.verificationGasLimit)
      const preVerificationGas = BigInt(op.preVerificationGas)
      const paymasterVerificationGas = BigInt(op.paymasterVerificationGasLimit)
      const postOpGas = BigInt(op.paymasterPostOpGasLimit)
      const maxFee = BigInt(op.maxFeePerGas)
      const priorityFee = BigInt(op.maxPriorityFeePerGas)
      if (callGas > 800_000n || verificationGas > 500_000n || preVerificationGas > 200_000n ||
        paymasterVerificationGas > 200_000n || postOpGas > 150_000n || maxFee > 100_000_000_000n ||
        priorityFee > maxFee || maxFee === 0n) throw new Error('Gas limits exceed sponsorship policy')
      const estimatedMaxCost = (callGas + verificationGas + preVerificationGas + paymasterVerificationGas + postOpGas) * maxFee
      if (estimatedMaxCost > maxCost) throw new Error('Operation exceeds sponsor cost limit')
      if (op.factory || op.factoryData) throw new Error('Account factory is not eligible')

      const validUntil = BigInt(now + 300)
      const message = keccak256(encodeAbiParameters([
        { type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }, { type: 'address' },
        { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' },
        { type: 'uint256' }, { type: 'bytes32' }, { type: 'uint128' }, { type: 'uint128' },
        { type: 'uint48' }, { type: 'uint256' },
      ], [
        typehash, paymaster, BigInt(base.id), sender, BigInt(op.nonce), keccak256('0x'),
        keccak256(op.callData as Hex), packGas(verificationGas, callGas), preVerificationGas,
        packGas(priorityFee, maxFee), paymasterVerificationGas, postOpGas, Number(validUntil), rewardAmount,
      ]))
      const signature = await signer.signMessage({ message: { raw: message } })
      return c.json({ paymaster, paymasterData: concat([toHex(validUntil, { size: 6 }), signature]),
        paymasterVerificationGasLimit: paymasterVerificationGas.toString(),
        paymasterPostOpGasLimit: postOpGas.toString(), validUntil: validUntil.toString(),
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Sponsorship declined' }, 400)
    }
  })
}
