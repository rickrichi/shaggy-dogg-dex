/**
 * Edge shim for prices.
 * Proxies to the canonical Hono backend (`/api/prices`) to keep a single contract.
 *
 * Supports GET (symbol query) and POST (portfolio prices).
 *
 * @runtime edge
 */
import { forwardToBackend } from './_proxy'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  return forwardToBackend(req, '/api/prices')
}
