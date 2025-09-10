// src/hooks/usePrices.ts
import { useEffect, useMemo, useRef, useState } from 'react'
import type { AddressHex } from '@/types/token'
import type { PricesApiResponse, PricesResponseOk, PricesResponseFail } from '@/types/prices'

// Keep your env override (preserved)
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

// Runtime type guards (lightweight, no zod here)
function isOk(u: unknown): u is PricesResponseOk {
  if (!u || typeof u !== 'object') return false
  const x = u as Record<string, unknown>
  if (x.success !== true) return false
  const data = x.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return false
  const prices = (data as Record<string, unknown>).prices
  return Array.isArray(prices)
}

function isFail(u: unknown): u is PricesResponseFail {
  if (!u || typeof u !== 'object') return false
  const x = u as Record<string, unknown>
  return x.success === false && typeof x.error === 'string'
}

export function usePrices(chainId: number, addresses: readonly AddressHex[]) {
  // Preserved state shape
  const [data, setData] = useState<PricesApiResponse | undefined>()
  const [error, setError] = useState<Error | undefined>()
  const [loading, setLoading] = useState<boolean>(true)

  // NEW: stabilize addresses (dedupe + sort) to reduce churn & match server cache keys
  const stableAddresses = useMemo(() => {
    const set = new Set(addresses.map(a => a.toLowerCase()))
    return Array.from(set).sort().map(a => (`0x${a.replace(/^0x/i, '')}` as AddressHex))
  }, [addresses])

  // Preserved: stable payload to avoid effect churn (now uses stableAddresses)
  const payload = useMemo(
    () => ({ chainId, addresses: stableAddresses }),
    [chainId, stableAddresses]
  )

  // Prevent duplicate in-flight for same key
  const lastKey = useRef<string>('')
  const key = useMemo(() => `${chainId}:${stableAddresses.join(',')}`, [chainId, stableAddresses])

  useEffect(() => {
    if (key === lastKey.current) return
    lastKey.current = key

    let cancelled = false
    const controller = new AbortController()
    setLoading(true)
    setError(undefined)

    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/prices`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        const json: unknown = await res.json()
        if (cancelled) return

        if (isOk(json) || isFail(json)) {
          setData(json)
        } else {
          setData({ success: false, error: 'malformed_response' })
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error('request_failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [key, payload])

  // Convenience accessor for callers that only need rows
  const prices = useMemo(() => (data && data.success ? data.data.prices : []), [data])

  return { data, prices, error, isLoading: loading }
}
