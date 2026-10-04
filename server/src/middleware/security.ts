// server/src/middleware/security.ts
import crypto from 'crypto'
import { cors } from 'hono/cors'

import { env } from '../env.js'

import type { MiddlewareHandler } from 'hono'

const isDevelopment = env.NODE_ENV === 'development'

// Generate nonce for inline scripts in production
const generateNonce = (): string => crypto.randomBytes(16).toString('base64')

// Permissions Policy for feature control
const getPermissionsPolicy = (): string => [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'bluetooth=()',
  'accelerometer=()',
  'gyroscope=()',
  'magnetometer=()',
  'ambient-light-sensor=()',
  'encrypted-media=()',
  'autoplay=()',
  'picture-in-picture=()',
  'display-capture=()',
  'fullscreen=(self)',
  'web-share=(self)'
].join(', ')

// CSP violation reporting endpoint
export const cspViolationReporter: MiddlewareHandler = async (c, next) => {
  if (c.req.path === '/api/csp-violation-report' && c.req.method === 'POST') {
    try {
      const violation = await c.req.json()
      console.warn('CSP Violation Report:', JSON.stringify(violation, null, 2))
      
      // In production, you might want to log this to a monitoring service
      if (!isDevelopment) {
        // Example: await sendToMonitoringService(violation)
      }
      
      return c.json({ received: true }, 200)
    } catch (error) {
      console.error('Failed to process CSP violation report:', error)
      return c.json({ error: 'invalid_report' }, 400)
    }
  }
  
  return await next()
}

export const withSecurityHeaders: MiddlewareHandler = async (c, next) => {
  // Generate nonce for production requests only
  const nonce = isDevelopment ? null : generateNonce()
  
  // Store nonce in context for use in responses
  if (nonce) {
    c.set('csp-nonce', nonce)
  }

  // Core security headers (always applied)
  c.header('X-Frame-Options', 'DENY')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('X-XSS-Protection', '1; mode=block')
  
  // Add CORB protection headers for API routes
  if (c.req.path.startsWith('/api/')) {
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Content-Type', 'application/json; charset=utf-8')
  }

  if (isDevelopment) {
    // Development mode: Skip CSP to avoid conflicts with Vite
    // Vite's dev server will handle CSP via vite.config.ts
    console.log('Development mode: Skipping backend CSP (handled by Vite)')
    
    // Keep minimal security headers for development
    c.header('Cross-Origin-Embedder-Policy', 'unsafe-none')
    c.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
    c.header('Permissions-Policy', getPermissionsPolicy())
  } else {
    // Production mode: Apply strict CSP and security headers
    c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
    c.header('Cross-Origin-Embedder-Policy', 'require-corp')
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    c.header('Permissions-Policy', getPermissionsPolicy())
    
    // Production CSP with nonce-based inline script support
    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self'${nonce ? ` 'nonce-${nonce}'` : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.alchemy.com https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://mainnet.base.org https://*.coinbase.com https://*.walletconnect.com",
      "worker-src 'self'",
      "child-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ]
    
    // Add CSP reporting in production
    cspDirectives.push("report-uri /api/csp-violation-report")
    
    c.header('Content-Security-Policy', cspDirectives.join('; '))
  }
  
  await next()
}

export const withCors = (origin: string) => {
  // Robust origin handling
  const allowedOrigins = isDevelopment 
    ? ['http://localhost:5173', 'http://localhost:4173']
    : [origin].filter(Boolean)
  
  // Add the provided origin to development origins if it's not already included
  if (isDevelopment && origin && !allowedOrigins.includes(origin)) {
    allowedOrigins.push(origin)
  }
  
  return cors({
    origin: allowedOrigins.length > 0
      ? allowedOrigins
      : (_requestOrigin: string) => null,  // Reject all origins when none configured
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Requested-With',
      'Accept',
      'Origin'
    ],
    credentials: true,
    maxAge: isDevelopment ? 0 : 86400,
  })
}

// Utility to get nonce from context (for use in HTML responses)
export const getCspNonce = (c: import('hono').Context): string | null => {
  return c.get('csp-nonce') || null
}

// Type augmentation for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    'csp-nonce': string
  }
}
