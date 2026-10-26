import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
const c = createPublicClient({ chain: base, transport: http('https://base-rpc.publicnode.com', { retryCount: 4 }) })
const a = '0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1'
let lo = 0n, hi = await c.getBlockNumber()
const has = async (b: bigint) => ((await c.getCode({ address: a, blockNumber: b })) ?? '0x').length > 2
if (!(await has(hi))) throw new Error('no code now')
while (lo + 1n < hi) { const mid = (lo + hi) / 2n; if (await has(mid)) hi = mid; else lo = mid }
console.log('first block with code', hi)
const blk = await c.getBlock({ blockNumber: hi, includeTransactions: true })
for (const tx of blk.transactions) {
  if (tx.to === null) { const r = await c.getTransactionReceipt({ hash: tx.hash }); if (r.contractAddress?.toLowerCase() === a.toLowerCase()) { console.log('deploy tx', tx.hash, 'from', tx.from, 'inputBytes', (tx.input.length - 2) / 2); console.log('tail', tx.input.slice(-256)) } }
}
