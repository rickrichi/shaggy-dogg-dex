import { defineConfig } from 'tsup'
export default defineConfig({
  entry: ['src/rpc/main.ts', 'src/rpc/keys.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist-rpc',
  // node:sqlite has no unprefixed "sqlite" built-in alias.
  removeNodeProtocol: false,
})
