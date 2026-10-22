/**
 * Edge shim for backend health checks.
 *
 * @runtime edge
 */
import { forwardToBackend } from './_proxy.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  return forwardToBackend(req, '/api/health')
}
