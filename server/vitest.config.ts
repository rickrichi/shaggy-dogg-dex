// server/vitest.config.ts — API server tests run in plain Node (real fetch headers, node:sqlite).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
