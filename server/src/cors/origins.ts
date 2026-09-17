// server/src/cors/origins.ts

/**
 * Centralized allowlist + matcher for CORS.
 *
 * Exposes simple primitives:
 *  - normalizeOrigin(raw) -> string
 *  - buildAllowedOrigins(...) -> AllowedOrigins
 *  - isAllowedOrigin(origin, allowed?) -> boolean
 *  - echoVettedOrigin(raw, allowed?) -> raw or null
 *  - vetOrigin(raw, allowed?) -> raw or null   (alias for back-compat)
 *
 * You can keep it purely "exact list" (fast Set lookup), or also include
 * wildcard/multi-tenant hosts via RegExp patterns.
 */

export type Nullable<T> = T | null;

/** Normalize an Origin string for comparison (lowercase + trim, strip trailing slash). */
export const normalizeOrigin = (o?: string | null) => {
  const s = (o ?? '').trim().toLowerCase();
  return s.endsWith('/') ? s.slice(0, -1) : s;
};

export interface AllowedOrigins {
  /** Exact, normalized origins. */
  exact: Set<string>;
  /** Patterns tested against normalized origins (no trailing slash). */
  patterns: RegExp[];
  /** Allow opaque `null` origins (file://, sandboxed iframes)? */
  allowNull: boolean;
}

/** Default development & sample production entries (edit to your project). */
const DEFAULT_EXACT = new Set<string>([
  // local dev
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  // add real prod hosts when you have them
]);

/** Default pattern examples (edit/remove for your project). */
const DEFAULT_PATTERNS: RegExp[] = [
  // e.g., Vercel previews: https://<branch>-<repo>-<org>.vercel.app
  /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.vercel\.app$/,
  // e.g., multi-tenant *.example.com
  /^https:\/\/([a-z0-9-]+\.)*example\.com$/,
];

interface BuildOpts {
  /** Allow opaque `null` origins? Default: false */
  allowNull?: boolean;
  /**
   * Read additional exact origins from env by prefix (e.g. "CORS_ORIGIN_").
   * Any env var whose name starts with this prefix and has a truthy value
   * will be added after normalization. Example:
   *   CORS_ORIGIN_1=https://app.example.com
   *   CORS_ORIGIN_2=http://localhost:5173
   */
  envPrefix?: string;
}

/**
 * Build an AllowedOrigins object.
 * - `exactInput` can be a comma string or an array (added to DEFAULT_EXACT).
 * - `patternInput` can add more RegExp patterns (in addition to DEFAULT_PATTERNS).
 * - env augmentation via opts.envPrefix (see docs above).
 */
export const buildAllowedOrigins = (
  exactInput?: string | string[] | null,
  patternInput?: Array<RegExp | string> | null,
  opts: BuildOpts = {}
): AllowedOrigins => {
  const allowNull = !!opts.allowNull;

  // start with defaults
  const exact = new Set(DEFAULT_EXACT);
  const patterns: RegExp[] = [...DEFAULT_PATTERNS];

  // add exact from input
  const exactList = Array.isArray(exactInput)
    ? exactInput
    : exactInput
    ? exactInput.split(',')
    : [];
  for (const val of exactList) {
    const norm = normalizeOrigin(val);
    if (norm) exact.add(norm);
  }

  // add exact from env via prefix
  if (opts.envPrefix) {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith(opts.envPrefix)) {
        const val = process.env[key];
        if (val) {
          const norm = normalizeOrigin(val);
          if (norm) exact.add(norm);
  }
}
    }
  }

  // add patterns from input
  if (patternInput && patternInput.length) {
    for (const p of patternInput) {
      if (p instanceof RegExp) {
        patterns.push(p);
      } else if (typeof p === 'string' && p.trim()) {
        // If a string was provided, treat it as a source for a new RegExp.
        // Expect full regex source (no slashes), e.g. "^https://(.+)\\.myapp\\.com$"
        patterns.push(new RegExp(p));
      }
    }
  }

  return { exact, patterns, allowNull };
};

/** Module-level default (safe for dev). */
export const DEFAULT_ALLOWED: AllowedOrigins = buildAllowedOrigins(
  process.env.CORS_EXACT ?? undefined,
  undefined,
  { allowNull: false, envPrefix: 'CORS_ORIGIN_' }
);

/** Check if a request Origin is allowed (raw or normalized accepted). */
export const isAllowedOrigin = (
  origin: string | undefined | null,
  allowed: Readonly<AllowedOrigins> = DEFAULT_ALLOWED
): boolean => {
  if (!origin) return allowed.allowNull;
  if (origin === 'null') return allowed.allowNull;

  // Must parse as URL (basic sanity). If it doesn't, disallow (unless allowNull).
  try {
    new URL(origin);
  } catch {
    return false;
  }

  const norm = normalizeOrigin(origin);
  if (allowed.exact.has(norm)) return true;
  for (const rx of allowed.patterns) {
    if (rx.test(norm)) return true;
  }
  return false;
};

/**
 * Returns the echoable ACAO value (the raw Origin) if vetted, else null.
 * We match against a normalized copy but echo the raw value (preserves case/slash).
 */
export const echoVettedOrigin = (
  rawOrigin: Nullable<string>,
  allowed: Readonly<AllowedOrigins> = DEFAULT_ALLOWED
): Nullable<string> => {
  if (rawOrigin === 'null' && allowed.allowNull) return rawOrigin;
  if (!rawOrigin) return null;
  return isAllowedOrigin(rawOrigin, allowed) ? rawOrigin : null;
};

/** Back-compat alias for older imports */
export const vetOrigin = (
  rawOrigin: Nullable<string>,
  allowed: Readonly<AllowedOrigins> = DEFAULT_ALLOWED
) => echoVettedOrigin(rawOrigin, allowed);
