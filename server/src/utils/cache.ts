// server/src/utils/cache.ts

// ---------- Types ----------
export interface CacheStats {
  readonly hits: number
  readonly misses: number
  readonly sets: number
  readonly evictions: number
  readonly hitRate: number          // hits / (hits + misses)
  readonly size: number
  readonly memoryPressure: number   // size / maxSize (0..1), 0 if maxSize not set
}

export interface TtlCacheOptions {
  readonly ttlMs: number
  readonly maxSize?: number           // optional LRU cap
  readonly cleanupIntervalMs?: number // proactive sweep; default 60s
  readonly enableStats?: boolean      // track hits/misses/evictions/set counters
}

export interface TtlCache<V> {
  get(key: string): V | undefined
  set(key: string, value: V): void
  delete(key: string): boolean
  clear(): void
  has(key: string): boolean
  keys(): IterableIterator<string>
  values(): IterableIterator<V>
  entries(): IterableIterator<[string, V]>
  cleanup(): number
  readonly size: number
  readonly stats: CacheStats
}

// ---------- Implementation ----------
interface Entry<V> {
  readonly value: V
  readonly createdAt: number
  readonly expiresAt: number
  readonly accessCount: number   // incremented when enableStats=true
  readonly lastAccessAt: number  // always updated; used for LRU
}

/**
 * High-performance TTL cache with:
 * - lazy + periodic cleanup
 * - optional LRU eviction (maxSize)
 * - optional stats (enableStats)
 * Accepts either a plain ttl number or an options object.
 */
export function makeTtlCache<V>(opts: number | TtlCacheOptions): TtlCache<V> {
  const ttlMs = typeof opts === 'number' ? opts : opts.ttlMs
  const maxSize = typeof opts === 'number' ? undefined : opts.maxSize
  const cleanupIntervalMs = typeof opts === 'number' ? 60_000 : opts.cleanupIntervalMs ?? 60_000
  const enableStats = typeof opts === 'number' ? false : !!opts.enableStats

  if (!(Number.isFinite(ttlMs) && ttlMs > 0)) {
    throw new Error('TTL must be a positive number (ms)')
  }
  if (maxSize !== undefined && !(Number.isFinite(maxSize) && maxSize > 0)) {
    throw new Error('maxSize must be a positive number when provided')
  }

  const map = new Map<string, Entry<V>>()

  // stats
  let hits = 0
  let misses = 0
  let sets = 0
  let evictions = 0

  // periodic cleanup
  let cleanupTimer: NodeJS.Timeout | undefined
  if (cleanupIntervalMs > 0) {
    cleanupTimer = setInterval(() => {
      try { cleanup() } catch { /* swallow */ }
    }, cleanupIntervalMs)
    // let Node exit even if timer exists
    cleanupTimer.unref?.()
  }

  function now() { return Date.now() }

  function isExpired(e: Entry<V>, t = now()) {
    return e.expiresAt <= t
  }

  function cleanup(): number {
    const t = now()
    let expired = 0
    for (const [k, e] of map) {
      if (isExpired(e, t)) {
        map.delete(k)
        expired++
        if (enableStats) evictions++
      }
    }
    return expired
  }

  // True LRU: pick the entry with the oldest lastAccessAt
  function evictLru(): void {
    if (!maxSize || map.size <= maxSize) return
    let oldestKey: string | undefined
    let oldestAt = Infinity
    for (const [k, e] of map) {
      if (e.lastAccessAt < oldestAt) {
        oldestAt = e.lastAccessAt
        oldestKey = k
      }
    }
    if (oldestKey !== undefined) {
      map.delete(oldestKey)
      if (enableStats) evictions++
    }
  }

  function touch(key: string, e: Entry<V>, t = now()): Entry<V> {
    const updated: Entry<V> = {
      ...e,
      lastAccessAt: t,
      accessCount: enableStats ? e.accessCount + 1 : e.accessCount,
    }
    map.set(key, updated)
    return updated
  }

  const api: TtlCache<V> = {
    get(key: string): V | undefined {
      if (typeof key !== 'string') throw new TypeError('Cache key must be a string')
      const e = map.get(key)
      if (!e) {
        if (enableStats) misses++
        return undefined
      }
      if (isExpired(e)) {
        map.delete(key)
        if (enableStats) { misses++; evictions++ }
        return undefined
      }
      if (enableStats) hits++
      touch(key, e)
      return e.value
    },

    set(key: string, value: V): void {
      if (typeof key !== 'string') throw new TypeError('Cache key must be a string')

      // opportunistic cleanup to keep the map tidy under load
      if (map.size > 64) cleanup()

      const t = now()
      const entry: Entry<V> = {
        value,
        createdAt: t,
        expiresAt: t + ttlMs,
        accessCount: 0,
        lastAccessAt: t,
      }
      map.set(key, entry)
      if (enableStats) sets++
      evictLru()
    },

    delete(key: string): boolean {
      if (typeof key !== 'string') throw new TypeError('Cache key must be a string')
      return map.delete(key)
    },

    clear(): void {
      map.clear()
      if (cleanupTimer) {
        clearInterval(cleanupTimer)
        cleanupTimer = undefined
      }
      // reset counters but keep derived getters meaningful
      hits = 0; misses = 0; sets = 0; evictions = 0
    },

    has(key: string): boolean {
      if (typeof key !== 'string') throw new TypeError('Cache key must be a string')
      const e = map.get(key)
      if (!e) return false
      if (isExpired(e)) {
        map.delete(key)
        if (enableStats) evictions++
        return false
      }
      return true
    },

    *keys(): IterableIterator<string> {
      const t = now()
      for (const [k, e] of map) {
        if (!isExpired(e, t)) yield k
      }
    },

    *values(): IterableIterator<V> {
      const t = now()
      for (const e of map.values()) {
        if (!isExpired(e, t)) yield e.value
      }
    },

    *entries(): IterableIterator<[string, V]> {
      const t = now()
      for (const [k, e] of map) {
        if (!isExpired(e, t)) yield [k, e.value]
      }
    },

    cleanup,

    get size(): number {
      return map.size
    },

    get stats(): CacheStats {
      const total = hits + misses
      const hitRate = total > 0 ? hits / total : 0
      const memoryPressure = maxSize ? map.size / maxSize : 0
      return { hits, misses, sets, evictions, hitRate, size: map.size, memoryPressure }
    },
  }

  return api
}

/**
 * Minimal TTL cache (get/set/size only) with near-zero overhead.
 * Accepts `ttlMs` as a number.
 */
export function makeSimpleTtlCache<V>(ttlMs: number): Pick<TtlCache<V>, 'get' | 'set' | 'size'> {
  if (!(Number.isFinite(ttlMs) && ttlMs > 0)) {
    throw new Error('TTL must be a positive number (ms)')
  }

  const map = new Map<string, { value: V; expiresAt: number }>()
  return {
    get(key: string): V | undefined {
      const e = map.get(key)
      if (!e) return undefined
      if (Date.now() > e.expiresAt) {
        map.delete(key)
        return undefined
      }
      return e.value
    },
    set(key: string, value: V): void {
      map.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    get size(): number {
      return map.size
    },
  }
}
