import 'dotenv/config'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RpcStore } from './store.js'
const store = new RpcStore(process.env.SHAGGY_RPC_DB ?? 'data/rpc.sqlite')
try {
  const [command, nameOrId, outputFile, minute, day] = process.argv.slice(2)
  if (command === 'create') {
    if (!nameOrId || !outputFile) throw new Error('Usage: create <project-name> <secret-file> [calls-per-minute] [calls-per-day]')
    // Refuse overwrites; preserve existing credentials.
    const key = store.create(nameOrId, Number(minute ?? 120), Number(day ?? 10000))
    try { writeFileSync(outputFile, key.secret + '\n', { mode: 0o600, flag: 'wx' }) }
    catch (error) { store.revoke(key.id); throw error }
    console.log(JSON.stringify({ id: key.id, secretFile: resolve(outputFile), note: 'Keep this file private. The database stores only the key hash.' }))
  } else if (command === 'list') console.log(JSON.stringify(store.list(), null, 2))
  else if (command === 'revoke' && nameOrId) {
    if (!store.revoke(nameOrId)) throw new Error('Key ID not found')
    console.log('Key revoked')
  } else if (command === 'usage' && nameOrId) console.log(JSON.stringify(store.usage(nameOrId), null, 2))
  else throw new Error('Commands: create <name> <secret-file> [rpm] [daily], list, revoke <id>, usage <id>')
} finally { store.db.close() }
