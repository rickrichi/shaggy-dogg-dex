/**
 * Edge shim for monthly launchpad launch counts (`/api/launches/stats`).
 *
 * @runtime edge
 */
import { forwardToBackend } from '../_proxy.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  return forwardToBackend(req, '/api/launches/stats')
}
