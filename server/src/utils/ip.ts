/** Normalize a raw IP or X-Forwarded-For string to a stable token. */
export function normalizeIp(raw: string): string {
  const first = (raw ?? '').split(',')[0]?.trim() ?? ''
  return first.toLowerCase() || 'unknown'
}
