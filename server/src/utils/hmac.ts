// server/src/utils/hmac.ts

import { createHmac, randomBytes,timingSafeEqual } from 'node:crypto'

/**
 * Constant-time string equality comparison to prevent timing attack vectors.
 * 
 * Leverages Node.js's cryptographically-secure timingSafeEqual implementation
 * rather than manual bit manipulation which may introduce timing variations
 * across different JavaScript engines or optimization levels.
 * 
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 * 
 * @security Critical for comparing secrets, tokens, or any sensitive values
 * where timing analysis could leak information about the expected value.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    throw new TypeError('constantTimeEqual requires string arguments')
  }

  const bufferA = Buffer.from(a, 'utf8')
  const bufferB = Buffer.from(b, 'utf8')
  
  // Early length mismatch still requires constant-time comparison
  // to prevent length-based timing attacks
  if (bufferA.length !== bufferB.length) {
    // Compare against a dummy buffer of the same length as bufferA
    // to maintain constant timing regardless of actual length difference
    const dummyBuffer = Buffer.alloc(bufferA.length, 0)
    timingSafeEqual(bufferA, dummyBuffer)
    return false
  }
  
  return timingSafeEqual(bufferA, bufferB)
}

/**
 * Generates HMAC-SHA256 digest in hexadecimal encoding.
 * 
 * @param secret - Secret key for HMAC generation
 * @param payload - Data to authenticate
 * @returns Hexadecimal-encoded HMAC-SHA256 digest
 * 
 * @example
 * ```typescript
 * const signature = hmacSha256Hex('my-secret', 'message-to-sign')
 * const isValid = constantTimeEqual(signature, receivedSignature)
 * ```
 */
export function hmacSha256Hex(secret: string, payload: string): string {
  if (typeof secret !== 'string' || typeof payload !== 'string') {
    throw new TypeError('hmacSha256Hex requires string arguments')
  }
  
  if (secret.length === 0) {
    throw new Error('HMAC secret cannot be empty')
  }
  
  return createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')
}

/**
 * Generates HMAC-SHA256 digest in base64 encoding.
 * 
 * Base64 encoding produces shorter strings than hex (44 vs 64 characters)
 * while maintaining the same cryptographic strength.
 */
export function hmacSha256Base64(secret: string, payload: string): string {
  if (typeof secret !== 'string' || typeof payload !== 'string') {
    throw new TypeError('hmacSha256Base64 requires string arguments')
  }
  
  if (secret.length === 0) {
    throw new Error('HMAC secret cannot be empty')
  }
  
  return createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('base64')
}

/**
 * Verifies HMAC signature against expected value using constant-time comparison.
 * 
 * @param secret - Secret key used for HMAC generation
 * @param payload - Original data that was signed
 * @param signature - Received signature to verify
 * @param encoding - Expected encoding of signature ('hex' | 'base64')
 * @returns true if signature is valid, false otherwise
 */
export function verifyHmacSignature(
  secret: string,
  payload: string,
  signature: string,
  encoding: 'hex' | 'base64' = 'hex'
): boolean {
  try {
    const expectedSignature = encoding === 'hex' 
      ? hmacSha256Hex(secret, payload)
      : hmacSha256Base64(secret, payload)
    
    return constantTimeEqual(signature, expectedSignature)
  } catch {
    // Any errors during HMAC generation should result in failed verification
    return false
  }
}

/**
 * Generates cryptographically secure random string for use as HMAC secrets.
 * 
 * @param length - Desired length in bytes (default: 32 bytes = 256 bits)
 * @param encoding - Output encoding ('hex' | 'base64')
 * @returns Cryptographically secure random string
 */
export function generateHmacSecret(
  length: number = 32,
  encoding: 'hex' | 'base64' = 'hex'
): string {
  if (length <= 0 || !Number.isInteger(length)) {
    throw new Error('Secret length must be a positive integer')
  }

  return randomBytes(length).toString(encoding)
}