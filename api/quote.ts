/**
 * Edge shim for swap quotes.
 * Proxies to the canonical Hono backend (`/api/quote`) to avoid contract drift.
 *
 * @runtime edge
 */
import { forwardToBackend } from './_proxy'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  return forwardToBackend(req, '/api/quote')
}
