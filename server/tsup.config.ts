import { defineConfig } from 'tsup'

// tsup strips the `node:` prefix by default; `node:sqlite` only exists WITH the prefix,
// so keep protocols intact or the production bundle crashes with ERR_MODULE_NOT_FOUND.
export default defineConfig({
  removeNodeProtocol: false,
})
