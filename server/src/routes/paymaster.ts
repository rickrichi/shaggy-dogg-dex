import type { Hono } from 'hono'
import { z } from 'zod'
import {
  concat,
  createPublicClient,
  decodeFunctionData,
  encodeAbiParameters,
  getAddress,
  http,
  isAddress,
  keccak256,
  parseAbi,
  toHex,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { recoverAuthorizationAddress } from 'viem/utils'

import type { Env } from '../env.js'

export type PaymasterEnvConfig = Pick<
  Env,
  | 'BASE_RPC_URL'
  | 'PAYMASTER_ADDRESS'
  | 'PAYMASTER_SIGNER_PRIVATE_KEY'
  | 'PAYMASTER_BUNDLER_URL'
  | 'PAYMASTER_ALLOWED_WALLETS'
> & {
  PAYMASTER_ELIGIBILITY_MODE?: 'open_portfolio' | 'allowlist'
}

const entryPoint = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as const
const implementation = '0xe6Cae83BdE06E4c305530e199D7217f42808555B' as const
const mrwd = '0xC17227AAa33C54634B6cE7AD0bf33A156563c179' as const
const muttProStaking = '0x67dBC193bF510225EBf189ab25dC3b34a32c1766' as const
const uniswapV2Router = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24' as const
const aerodromeRouter = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as const
const uniswapV3Router = '0x2626664c2603336E57B271c5C0b26F421741e481' as const

const designator = `0xef0100${implementation.slice(2).toLowerCase()}`
const hex = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/)
const address = z.string().refine(isAddress, 'Invalid address')
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/)
const authorizationSchema = z.object({
  address,
  chainId: z.number().int(),
  nonce: uint,
  r: hex,
  s: hex,
  yParity: z.union([z.literal(0), z.literal(1)]),
})
const signSchema = z.object({
  sender: address,
  nonce: uint,
  callData: hex,
  factory: address.optional(),
  factoryData: hex.optional(),
  callGasLimit: uint,
  verificationGasLimit: uint,
  preVerificationGas: uint,
  maxFeePerGas: uint,
  maxPriorityFeePerGas: uint,
  paymasterVerificationGasLimit: uint,
  paymasterPostOpGasLimit: uint,
  authorization: authorizationSchema.optional(),
})

const accountAbi = parseAbi([
  'function execute(address target, uint256 value, bytes data)',
  'function executeBatch((address target, uint256 value, bytes data)[] calls)',
])

const erc20Abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
])

const v2SwapAbi = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)',
])

const aeroSwapAbi = parseAbi([
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline) returns (uint256[] amounts)',
])

const v3SwapAbi = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
  'function exactInput((bytes path, address recipient, uint256 amountIn, uint256 amountOutMinimum) params) payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
])

const stakingAbi = parseAbi([
  'function stake(uint256 amount)',
  'function unstake(uint256 amount)',
  'function relockAll()',
  'function withdrawMatured() returns (uint256 amount)',
  'function token() view returns (address)',
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

const typehash = keccak256(
  toHex(
    'Sponsorship(address paymaster,uint256 chainId,address sender,uint256 nonce,bytes32 initCodeHash,bytes32 callDataHash,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,uint128 paymasterVerificationGasLimit,uint128 paymasterPostOpGasLimit,uint48 validUntil,uint256 rewardAmount)'
  )
)

const allowedRpcMethods = new Set([
  'eth_supportedEntryPoints',
  'eth_estimateUserOperationGas',
  'eth_sendUserOperation',
  'eth_getUserOperationReceipt',
  'eth_getUserOperationByHash',
])

const allowedSwapRouters = new Set([
  uniswapV2Router.toLowerCase(),
  aerodromeRouter.toLowerCase(),
  uniswapV3Router.toLowerCase(),
])

interface InnerCall {
  target: Address
  value: bigint
  data: Hex
}

function uint128(value: bigint, label: string): bigint {
  if (value > (1n << 128n) - 1n) throw new Error(`${label} exceeds uint128`)
  return value
}

function packGas(upper: bigint, lower: bigint): Hex {
  return toHex((uint128(upper, 'gas') << 128n) | uint128(lower, 'gas'), { size: 32 })
}

function extractCalls(callData: Hex): InnerCall[] {
  const decoded = decodeFunctionData({ abi: accountAbi, data: callData })
  if (decoded.functionName === 'execute') {
    const [target, value, data] = decoded.args
    return [{ target: getAddress(target), value, data }]
  }
  if (decoded.functionName === 'executeBatch') {
    const [calls] = decoded.args
    return calls.map((call) => ({
      target: getAddress(call.target),
      value: call.value,
      data: call.data,
    }))
  }
  throw new Error('Unsupported account execution method')
}

type ContractReader = {
  readContract: ReturnType<typeof createPublicClient>['readContract']
}

async function verifyEligiblePortfolioCalls(
  client: ContractReader,
  sender: Address,
  calls: InnerCall[]
): Promise<void> {
  if (calls.length === 0 || calls.length > 2) {
    throw new Error('Operation must contain 1 or 2 calls')
  }
  for (const call of calls) {
    if (call.value !== 0n) {
      throw new Error('Sponsored portfolio operations cannot send native ETH value')
    }
  }

  // Case 1: Single call (ERC-20 transfer, DEX swap with existing allowance, or Staking action)
  if (calls.length === 1) {
    const call = calls[0]!
    // Try ERC-20 transfer
    try {
      const transfer = decodeFunctionData({ abi: erc20Abi, data: call.data })
      if (transfer.functionName === 'transfer') {
        const [recipient, amount] = transfer.args
        if (amount <= 0n || recipient.toLowerCase() === sender.toLowerCase()) {
          throw new Error('Transfer amount and recipient must be valid')
        }
        const balance = await client.readContract({
          address: call.target,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [sender],
        })
        if (balance < amount) throw new Error('Insufficient portfolio token balance')
        return
      }
      if (transfer.functionName === 'approve') {
        const [spender, amount] = transfer.args
        if (amount <= 0n) throw new Error('Approval amount must be positive')
        if (
          !allowedSwapRouters.has(spender.toLowerCase()) &&
          spender.toLowerCase() !== muttProStaking.toLowerCase()
        ) {
          // Check if spender is a valid staking contract by reading `token()`
          const stakedToken = await client
            .readContract({ address: spender, abi: stakingAbi, functionName: 'token' })
            .catch(() => null)
          if (!stakedToken || stakedToken.toLowerCase() !== call.target.toLowerCase()) {
            throw new Error('Approval spender must be a verified DEX router or staking vault')
          }
        }
        return
      }
    } catch (err) {
      if (err instanceof Error && !err.message.includes('signature')) throw err
    }

    // Try DEX Swap
    if (allowedSwapRouters.has(call.target.toLowerCase())) {
      await verifySwapCall(client, sender, call.target, call.data)
      return
    }

    // Try Staking (MuttProStaking or Launchpad FeeDiscountStaking)
    await verifyStakingCall(client, sender, call.target, call.data)
    return
  }

  // Case 2: Two-call batch: [ERC20.approve(spender, amount), SwapOrStake(spender, ...)]
  const [first, second] = calls as [InnerCall, InnerCall]
  const approval = decodeFunctionData({ abi: erc20Abi, data: first.data })
  if (approval.functionName !== 'approve') {
    throw new Error('Batched operation must start with an ERC-20 approve call')
  }
  const [spender, approvedAmount] = approval.args
  if (approvedAmount <= 0n || spender.toLowerCase() !== second.target.toLowerCase()) {
    throw new Error('Batch approval spender must match the target of the second call')
  }
  const tokenBalance = await client.readContract({
    address: first.target,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [sender],
  })
  if (tokenBalance < approvedAmount) {
    throw new Error('Insufficient portfolio token balance for batched operation')
  }

  if (allowedSwapRouters.has(second.target.toLowerCase())) {
    await verifySwapCall(client, sender, second.target, second.data, first.target, approvedAmount)
    return
  }

  await verifyStakingCall(client, sender, second.target, second.data, first.target, approvedAmount)
}

async function verifySwapCall(
  client: ContractReader,
  sender: Address,
  router: Address,
  data: Hex,
  expectedTokenIn?: Address,
  expectedAmountIn?: bigint
): Promise<void> {
  const routerLower = router.toLowerCase()

  if (routerLower === uniswapV2Router.toLowerCase()) {
    const decoded = decodeFunctionData({ abi: v2SwapAbi, data })
    const [amountIn, , path, to] = decoded.args
    const tokenIn = path[0]
    if (!tokenIn || path.length < 2 || amountIn <= 0n) throw new Error('Invalid V2 swap path or amount')
    if (to.toLowerCase() !== sender.toLowerCase()) throw new Error('Swap recipient must be your wallet')
    if (expectedTokenIn && tokenIn.toLowerCase() !== expectedTokenIn.toLowerCase()) {
      throw new Error('Swap input token does not match approval token')
    }
    if (expectedAmountIn && amountIn > expectedAmountIn) {
      throw new Error('Swap amount exceeds approved amount')
    }
    const balance = await client.readContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [sender],
    })
    if (balance < amountIn) throw new Error('Insufficient portfolio token balance for swap')
    return
  }

  if (routerLower === aerodromeRouter.toLowerCase()) {
    const decoded = decodeFunctionData({ abi: aeroSwapAbi, data })
    const [amountIn, , routes, to] = decoded.args
    const tokenIn = routes[0]?.from
    if (!tokenIn || routes.length < 1 || amountIn <= 0n) {
      throw new Error('Invalid Aerodrome swap route or amount')
    }
    if (to.toLowerCase() !== sender.toLowerCase()) throw new Error('Swap recipient must be your wallet')
    if (expectedTokenIn && tokenIn.toLowerCase() !== expectedTokenIn.toLowerCase()) {
      throw new Error('Swap input token does not match approval token')
    }
    if (expectedAmountIn && amountIn > expectedAmountIn) {
      throw new Error('Swap amount exceeds approved amount')
    }
    const balance = await client.readContract({
      address: tokenIn,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [sender],
    })
    if (balance < amountIn) throw new Error('Insufficient portfolio token balance for swap')
    return
  }

  if (routerLower === uniswapV3Router.toLowerCase()) {
    const decoded = decodeFunctionData({ abi: v3SwapAbi, data })
    const innerData =
      decoded.functionName === 'multicall' ? decoded.args[1][0] : data
    if (!innerData) throw new Error('Empty V3 multicall')
    const swap = decodeFunctionData({ abi: v3SwapAbi, data: innerData })
    if (swap.functionName === 'exactInputSingle') {
      const params = swap.args[0]
      if (params.amountIn <= 0n) throw new Error('Invalid V3 swap amount')
      if (expectedTokenIn && params.tokenIn.toLowerCase() !== expectedTokenIn.toLowerCase()) {
        throw new Error('V3 input token does not match approval token')
      }
      const balance = await client.readContract({
        address: params.tokenIn,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [sender],
      })
      if (balance < params.amountIn) throw new Error('Insufficient portfolio token balance for swap')
      return
    }
    if (swap.functionName === 'exactInput') {
      const params = swap.args[0]
      if (params.amountIn <= 0n || params.path.length < 43 * 2) {
        throw new Error('Invalid V3 multi-hop path')
      }
      const tokenIn = getAddress(`0x${params.path.slice(2, 42)}`)
      if (expectedTokenIn && tokenIn.toLowerCase() !== expectedTokenIn.toLowerCase()) {
        throw new Error('V3 input token does not match approval token')
      }
      const balance = await client.readContract({
        address: tokenIn,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [sender],
      })
      if (balance < params.amountIn) throw new Error('Insufficient portfolio token balance for swap')
      return
    }
  }

  throw new Error('Unsupported swap router or swap method')
}

async function verifyStakingCall(
  client: ContractReader,
  sender: Address,
  stakingContract: Address,
  data: Hex,
  expectedToken?: Address,
  expectedAmount?: bigint
): Promise<void> {
  const decoded = decodeFunctionData({ abi: stakingAbi, data })
  const stakedToken = await client
    .readContract({ address: stakingContract, abi: stakingAbi, functionName: 'token' })
    .catch(() => null)
  if (!stakedToken || !isAddress(stakedToken)) {
    throw new Error('Target contract is not a verified staking vault')
  }
  if (expectedToken && stakedToken.toLowerCase() !== expectedToken.toLowerCase()) {
    throw new Error('Staking vault token does not match approved token')
  }
  if (decoded.functionName === 'stake') {
    const [amount] = decoded.args
    if (amount <= 0n) throw new Error('Stake amount must be positive')
    if (expectedAmount && amount > expectedAmount) {
      throw new Error('Stake amount exceeds approved amount')
    }
    const balance = await client.readContract({
      address: stakedToken,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [sender],
    })
    if (balance < amount) throw new Error('Insufficient token balance to stake')
    return
  }
  if (
    decoded.functionName === 'unstake' ||
    decoded.functionName === 'relockAll' ||
    decoded.functionName === 'withdrawMatured'
  ) {
    return
  }
  throw new Error('Unsupported staking operation')
}

export function mountPaymasterRoutes(app: Hono, config: PaymasterEnvConfig): void {
  const client = createPublicClient({ chain: base, transport: http(config.BASE_RPC_URL) })
  const paymaster = config.PAYMASTER_ADDRESS ? getAddress(config.PAYMASTER_ADDRESS) : undefined
  const signer = config.PAYMASTER_SIGNER_PRIVATE_KEY
    ? privateKeyToAccount(config.PAYMASTER_SIGNER_PRIVATE_KEY as Hex)
    : undefined
  const allowedWallets = new Set(config.PAYMASTER_ALLOWED_WALLETS)
  const eligibilityMode = config.PAYMASTER_ELIGIBILITY_MODE ?? 'open_portfolio'
  const ready = Boolean(
    paymaster &&
      signer &&
      config.PAYMASTER_BUNDLER_URL &&
      (eligibilityMode === 'open_portfolio' || allowedWallets.size > 0)
  )

  const isWalletEligible = (walletAddress: string): boolean => {
    const normalized = walletAddress.trim().toLowerCase()
    if (!isAddress(normalized)) return false
    if (eligibilityMode === 'open_portfolio') return true
    return allowedWallets.has(normalized)
  }

  app.get('/api/paymaster/config', (c) => {
    const walletQuery = c.req.query('wallet') ?? ''
    return c.json({
      ready,
      chainId: base.id,
      entryPoint,
      paymaster: paymaster ?? null,
      accountImplementation: implementation,
      muttProStaking,
      eligibilityMode,
      supportedOperations: ['transfer', 'swap', 'stake'],
      walletEligible: walletQuery ? isWalletEligible(walletQuery) : eligibilityMode === 'open_portfolio',
    })
  })

  app.post('/api/paymaster/bundler', async (c) => {
    if (!ready || !config.PAYMASTER_BUNDLER_URL) {
      return c.json({ error: 'Paymaster is not configured' }, 503)
    }
    const body = (await c.req.json().catch(() => null)) as unknown
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: 'Invalid RPC request' }, 400)
    }
    const rpc = body as Record<string, unknown>
    if (
      rpc.jsonrpc !== '2.0' ||
      typeof rpc.method !== 'string' ||
      !allowedRpcMethods.has(rpc.method) ||
      !Array.isArray(rpc.params) ||
      JSON.stringify(body).length > 60_000
    ) {
      return c.json({ error: 'RPC method is not allowed' }, 400)
    }
    if (rpc.method === 'eth_sendUserOperation' || rpc.method === 'eth_estimateUserOperationGas') {
      const operation = rpc.params[0]
      const requestedEntryPoint = rpc.params[1]
      if (
        !operation ||
        typeof operation !== 'object' ||
        Array.isArray(operation) ||
        !('sender' in operation) ||
        typeof operation.sender !== 'string' ||
        !isWalletEligible(operation.sender) ||
        typeof requestedEntryPoint !== 'string' ||
        requestedEntryPoint.toLowerCase() !== entryPoint.toLowerCase()
      ) {
        return c.json({ error: 'User operation is not eligible' }, 403)
      }
    }
    try {
      const originHeader = c.req.header('origin') ?? 'https://dex.lumsian.com'
      const response = await fetch(config.PAYMASTER_BUNDLER_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: originHeader,
          referer: `${originHeader}/`,
        },
        body: JSON.stringify(body),
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
    if (!ready || !paymaster || !signer) {
      return c.json({ error: 'Paymaster is not configured' }, 503)
    }
    const parsed = signSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: 'Invalid sponsorship request' }, 400)
    const op = parsed.data
    const sender = getAddress(op.sender)
    if (!isWalletEligible(sender)) return c.json({ error: 'Wallet is not eligible' }, 403)

    try {
      const senderCode = await client.getBytecode({ address: sender })
      if (senderCode?.toLowerCase() !== designator) {
        if (senderCode && senderCode !== '0x') {
          throw new Error('Wallet uses a different account implementation')
        }
        if (!op.authorization) throw new Error('EIP-7702 authorization is required')
        const auth = op.authorization
        if (getAddress(auth.address) !== implementation || auth.chainId !== base.id) {
          throw new Error('Authorization targets the wrong chain or account implementation')
        }
        const recovered = await recoverAuthorizationAddress({
          authorization: {
            address: getAddress(auth.address),
            chainId: auth.chainId,
            nonce: Number(auth.nonce),
            r: auth.r as Hex,
            s: auth.s as Hex,
            yParity: auth.yParity,
          },
        })
        if (recovered.toLowerCase() !== sender.toLowerCase()) {
          throw new Error('Authorization signer mismatch')
        }
        const currentNonce = await client.getTransactionCount({ address: sender })
        if (BigInt(auth.nonce) !== BigInt(currentNonce)) {
          throw new Error('Authorization nonce is stale')
        }
      }

      const calls = extractCalls(op.callData as Hex)
      await verifyEligiblePortfolioCalls(client, sender, calls)

      const [
        onchainSigner,
        rewardToken,
        rewardAmount,
        maxCost,
        cooldown,
        lastSponsoredAt,
        paused,
        available,
        depositInfo,
      ] = await Promise.all([
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'sponsorSigner' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'rewardToken' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'rewardAmount' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'maxCostPerOp' }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'cooldownSeconds' }),
        client.readContract({
          address: paymaster,
          abi: paymasterAbi,
          functionName: 'lastSponsoredAt',
          args: [sender],
        }),
        client.readContract({ address: paymaster, abi: paymasterAbi, functionName: 'paused' }),
        client.readContract({
          address: paymaster,
          abi: paymasterAbi,
          functionName: 'availableRewards',
        }),
        client.readContract({
          address: entryPoint,
          abi: parseAbi([
            'function getDepositInfo(address account) view returns ((uint256 deposit, bool staked, uint112 stake, uint32 unstakeDelaySec, uint48 withdrawTime) info)',
          ]),
          functionName: 'getDepositInfo',
          args: [paymaster],
        }),
      ])
      if (onchainSigner.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error('Sponsor signer does not match contract')
      }
      if (rewardToken.toLowerCase() !== mrwd.toLowerCase()) {
        throw new Error('Configured paymaster does not reward MRWD')
      }
      if (paused || available < rewardAmount) {
        throw new Error('Reward program is paused or MRWD reward pool is low')
      }
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
      if (
        callGas > 1_200_000n ||
        verificationGas > 600_000n ||
        preVerificationGas > 250_000n ||
        paymasterVerificationGas > 250_000n ||
        postOpGas > 200_000n ||
        maxFee > 100_000_000_000n ||
        priorityFee > maxFee ||
        maxFee === 0n
      ) {
        throw new Error('Gas limits exceed sponsorship policy')
      }
      const estimatedMaxCost =
        (callGas + verificationGas + preVerificationGas + paymasterVerificationGas + postOpGas) *
        maxFee
      if (estimatedMaxCost > maxCost) {
        throw new Error('Operation exceeds sponsor maxCostPerOp limit')
      }
      if (depositInfo.deposit < estimatedMaxCost) {
        throw new Error(
          'Paymaster ETH gas deposit on EntryPoint v0.8 is below this operation cost. Deposit ETH in the Paymaster Operations console.'
        )
      }
      if (op.factory || op.factoryData) throw new Error('Account factory is not eligible')

      const validUntil = BigInt(now + 300)
      const message = keccak256(
        encodeAbiParameters(
          [
            { type: 'bytes32' },
            { type: 'address' },
            { type: 'uint256' },
            { type: 'address' },
            { type: 'uint256' },
            { type: 'bytes32' },
            { type: 'bytes32' },
            { type: 'bytes32' },
            { type: 'uint256' },
            { type: 'bytes32' },
            { type: 'uint128' },
            { type: 'uint128' },
            { type: 'uint48' },
            { type: 'uint256' },
          ],
          [
            typehash,
            paymaster,
            BigInt(base.id),
            sender,
            BigInt(op.nonce),
            keccak256('0x'),
            keccak256(op.callData as Hex),
            packGas(verificationGas, callGas),
            preVerificationGas,
            packGas(priorityFee, maxFee),
            paymasterVerificationGas,
            postOpGas,
            Number(validUntil),
            rewardAmount,
          ]
        )
      )
      const signature = await signer.signMessage({ message: { raw: message } })
      return c.json({
        paymaster,
        paymasterData: concat([toHex(validUntil, { size: 6 }), signature]),
        paymasterVerificationGasLimit: paymasterVerificationGas.toString(),
        paymasterPostOpGasLimit: postOpGas.toString(),
        validUntil: validUntil.toString(),
      })
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : 'Sponsorship declined' }, 400)
    }
  })
}
