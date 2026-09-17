// server/src/cors/actual.ts
import { echoVettedOrigin } from './origins.js'

import type { MiddlewareHandler } from 'hono'

/**
 * Adds ACAO/credentials on NON-OPTIONS responses using the same vetted logic.
 */
export const corsActual = (): MiddlewareHandler => {
  return async (c, next) => {
    await next()

    const origin = c.req.header('Origin') ?? null
    const echo = echoVettedOrigin(origin) // uses DEFAULT_ALLOWED inside origins.ts
    if (!echo) return

    // Don’t clobber existing Vary
    c.header('Vary', 'Origin', { append: true })
    c.header('Access-Control-Allow-Origin', echo)
    c.header('Access-Control-Allow-Credentials', 'true')
    // expose whatever your client reads
    c.header('Access-Control-Expose-Headers', 'Content-Type')
  }
}

export default corsActual
