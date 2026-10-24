/**
 * Edge shim for launchpad launch tracking.
 * Proxies to the canonical Hono backend (`/api/launches`): POST reports a launch, GET lists them.
 *
 * @runtime edge
 */
import { forwardToBackend } from '../_proxy.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  return forwardToBackend(req, '/api/launches')
}
