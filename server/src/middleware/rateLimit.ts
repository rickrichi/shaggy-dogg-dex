// server/src/middleware/rateLimit.ts

import type { MiddlewareHandler, Context } from 'hono'

export interface RateLimitOptions {
  readonly windowMs: number
  readonly max: number
  readonly identify?: (ip: string) => string
  readonly store?: Map<string, Bucket>
  readonly skipSuccessfulRequests?: boolean
  readonly skipFailedRequests?: boolean
}

type Bucket = {
  count: number
  resetAt: number
}

const defaultStore = new Map<string, Bucket>()

/**
 * Extracts client IP from request headers with precedence-based fallback
 * Handles X-Forwarded-For comma-separated chains and proxy scenarios
 */
function extractClientIp(headers: Headers): string {
  // Handle X-Forwarded-For chain (leftmost is original client)
  const xForwardedFor = headers.get('x-forwarded-for')
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0]?.trim()
    if (firstIp && firstIp !== 'unknown') return firstIp
  }

  // Cloudflare-specific header
  const cfConnectingIp = headers.get('cf-connecting-ip')
  if (cfConnectingIp && cfConnectingIp !== 'unknown') return cfConnectingIp.trim()

  // Generic real IP header
  const xRealIp = headers.get('x-real-ip')
  if (xRealIp && xRealIp !== 'unknown') return xRealIp.trim()

  // Last resort fallback
  return 'unknown'
}

/**
 * Rate limiting middleware with sliding window counter
 * Implements memory-efficient bucket management with automatic cleanup
 */
export const rateLimit = (options: RateLimitOptions): MiddlewareHandler => {
  const {
    windowMs,
    max,
    identify = (ip: string) => ip,
    store = defaultStore,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = options

  return async (c: Context, next) => {
    const clientIp = extractClientIp(c.req.raw.headers)
    const key = identify(clientIp)
    const now = Date.now()

    // Retrieve or initialize bucket
    let bucket = store.get(key)
    
    // Reset expired bucket or create new one
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 1, resetAt: now + windowMs }
      store.set(key, bucket)
    } else {
      // Check limit before incrementing
      if (bucket.count >= max) {
        const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000)
        c.header('Retry-After', String(retryAfterSeconds))
        c.header('X-RateLimit-Limit', String(max))
        c.header('X-RateLimit-Remaining', '0')
        c.header('X-RateLimit-Reset', String(bucket.resetAt))
        
        return c.json({ 
          error: 'rate_limited',
          message: `Too many requests. Try again in ${retryAfterSeconds} seconds.`
        } as const, 429)
      }
      
      // Increment counter for ongoing window
      bucket.count++
    }

    // Add rate limit headers for successful requests
    c.header('X-RateLimit-Limit', String(max))
    c.header('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
    c.header('X-RateLimit-Reset', String(bucket.resetAt))

    const result = await next()

    // Optional: Adjust count based on response status
    if (skipSuccessfulRequests && c.res.status < 400) {
      bucket.count = Math.max(0, bucket.count - 1)
    } else if (skipFailedRequests && c.res.status >= 400) {
      bucket.count = Math.max(0, bucket.count - 1)
    }

    return result
  }
}

/**
 * Memory-conscious store cleanup utility
 * Should be called periodically to prevent memory leaks
 */
export const cleanupExpiredBuckets = (store: Map<string, Bucket>): number => {
  const now = Date.now()
  let cleaned = 0
  
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key)
      cleaned++
    }
  }
  
  return cleaned
}