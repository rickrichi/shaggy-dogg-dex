// server/src/cors/preflights
import { vetOrigin } from './origins.js'

import type { MiddlewareHandler } from 'hono'

/**
 * Answers CORS preflight (OPTIONS) using the same vetted origin logic.
 * Returns 204 with the negotiated headers, or 403 if the Origin is not allowed.
 */
export const preflight = (): MiddlewareHandler => {
  return async (c, next) => {
    if (c.req.method !== 'OPTIONS') return next()

    const origin = c.req.header('Origin') ?? null
    const echo = vetOrigin(origin) // uses DEFAULT_ALLOWED inside origins.ts
    if (!echo) return c.text('Forbidden', 403)

    const acrm = c.req.header('Access-Control-Request-Method') ?? 'GET'
    const acrh = c.req.header('Access-Control-Request-Headers') ?? ''

    // Empty body + 204 + headers
    return c.body(null, 204, {
      'Access-Control-Allow-Origin': echo,
      'Vary': 'Origin',
      'Access-Control-Allow-Methods': acrm,
      'Access-Control-Allow-Headers': acrh,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '600',
    })
  }
}

export default preflight
