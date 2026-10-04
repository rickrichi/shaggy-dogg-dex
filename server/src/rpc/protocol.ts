export type RpcId = string | number | null
export interface RpcRequest { jsonrpc: '2.0'; id?: RpcId; method: string; params?: unknown[] }
export const rpcError = (id: RpcId, code: number, message: string, data?: string) => ({
  jsonrpc: '2.0' as const, id, error: { code, message, ...(data === undefined ? {} : { data }) },
})
const methods = new Set([
  'eth_chainId', 'net_version', 'web3_clientVersion', 'eth_blockNumber', 'eth_syncing',
  'eth_gasPrice', 'eth_maxPriorityFeePerGas', 'eth_feeHistory', 'eth_getBalance',
  'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount', 'eth_call', 'eth_estimateGas',
  'eth_getBlockByNumber', 'eth_getBlockByHash', 'eth_getTransactionByHash',
  'eth_getTransactionReceipt', 'eth_getLogs', 'eth_getBlockReceipts', 'eth_getProof',
  'eth_getBlockTransactionCountByNumber', 'eth_getBlockTransactionCountByHash',
  'eth_getTransactionByBlockNumberAndIndex', 'eth_getTransactionByBlockHashAndIndex',
  'eth_blobBaseFee', 'eth_protocolVersion',
])
export const SEND_METHOD = 'eth_sendRawTransaction'
export function parseRequest(value: unknown): RpcRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const request = value as Record<string, unknown>
  if (request.jsonrpc !== '2.0' || typeof request.method !== 'string' || request.method.length > 100 ||
    ('params' in request && !Array.isArray(request.params)) ||
    ('id' in request && request.id !== null && typeof request.id !== 'string' &&
      !(typeof request.id === 'number' && Number.isSafeInteger(request.id)))) return null
  return request as unknown as RpcRequest
}
export function validateMethod(request: RpcRequest, allowSend = false): string | null {
  const params = request.params ?? []
  if (request.method === SEND_METHOD) {
    if (!allowSend) return 'Transaction submission is not enabled on this endpoint'
    const raw = params[0]
    if (params.length !== 1 || typeof raw !== 'string' || !/^0x([0-9a-fA-F]{2}){1,131072}$/.test(raw))
      return 'A single hex-encoded signed transaction (max 128 KiB) is required'
    return null
  }
  if (!methods.has(request.method)) return 'Method not enabled on this read-only endpoint'
  if (request.method === 'eth_getLogs') {
    const filter = params[0] as Record<string, unknown> | undefined
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return 'A log filter is required'
    if (typeof filter.blockHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(filter.blockHash)) {
      if (filter.fromBlock !== undefined || filter.toBlock !== undefined) return 'Use blockHash or a block range'
      return null
    }
    if (typeof filter.fromBlock !== 'string' || typeof filter.toBlock !== 'string' ||
      !/^0x[0-9a-fA-F]{1,16}$/.test(filter.fromBlock) || !/^0x[0-9a-fA-F]{1,16}$/.test(filter.toBlock))
      return 'Logs require explicit hexadecimal fromBlock and toBlock, or blockHash'
    const span = BigInt(filter.toBlock) - BigInt(filter.fromBlock)
    if (span < 0n || span >= 2000n) return 'Log range must contain at most 2000 blocks'
  }
  if (request.method === 'eth_feeHistory') {
    const count = params[0]
    if (typeof count !== 'string' || !/^0x[0-9a-fA-F]{1,4}$/.test(count) || BigInt(count) > 1024n)
      return 'Fee history requires a hexadecimal block count of at most 1024'
  }
  return null
}
