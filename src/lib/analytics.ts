// src/lib/analytics.ts - Enterprise analytics service
/**
 * Analytics Service
 *
 * Tracks user events, conversions, and behavior across the DEX.
 * Supports multiple analytics providers (GA4, Mixpanel, custom backend).
 *
 * Usage:
 * ```ts
 * import { analytics } from '@/lib/analytics';
 *
 * analytics.track('swap_completed', {
 *   from_token: 'ETH',
 *   to_token: 'USDC',
 *   amount: '1.5',
 *   chain_id: 1,
 * });
 * ```
 */

// ══════════════════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE HOOKS
// ══════════════════════════════════════════════════════════════════════════════

import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export type AnalyticsEvent =
  // Wallet Events
  | "wallet_connected"
  | "wallet_disconnected"
  | "wallet_changed"
  | "chain_changed"

  // Swap Events
  | "swap_initiated"
  | "swap_quote_fetched"
  | "swap_approved"
  | "swap_completed"
  | "swap_failed"
  | "swap_cancelled"

  // Liquidity Events
  | "liquidity_add_initiated"
  | "liquidity_add_completed"
  | "liquidity_remove_initiated"
  | "liquidity_remove_completed"

  // Limit Order Events
  | "limit_order_created"
  | "limit_order_cancelled"
  | "limit_order_filled"
  | "limit_order_expired"

  // Staking Events
  | "stake_initiated"
  | "stake_completed"
  | "unstake_initiated"
  | "unstake_completed"

  // Navigation Events
  | "page_view"
  | "route_changed"
  | "route_computed"
  | "route_selected"
  | "route_failed"
  | "quote_source_selected"

  // Error Events
  | "error_occurred"
  | "transaction_failed"
  | "rpc_error"
  | "contract_revert"

  // Performance Events
  | "slow_render"
  | "api_timeout"

  // Execution/Configuration Events
  | "mev_protection_toggled"
  | "slippage_auto_adjusted"
  | "gas_config_updated"
  | "oracle_fallback_used";

export interface EventProperties {
  readonly [key: string]: string | number | boolean | undefined | null;
}

export interface UserProperties {
  readonly wallet_address?: string;
  readonly chain_id?: number;
  readonly wallet_type?: string;
  readonly [key: string]: string | number | boolean | undefined;
}

interface AnalyticsBackendPayload {
  readonly event: string;
  readonly properties: EventProperties;
  readonly timestamp: number;
}

interface AnalyticsPrivacyConfig {
  readonly respectDnt: boolean;
  readonly requireConsent: boolean;
  readonly redactUserAgent: boolean;
  readonly redactReferrer: boolean;
}

interface AnalyticsEnvConfig {
  readonly backendEnabled: boolean;
  readonly gaEnabled: boolean;
  readonly mixpanelEnabled: boolean;
}

class IsomorphicAnalyticsClient {
  private queue: AnalyticsBackendPayload[] = [];
  private readonly endpoint: string;
  private readonly debugMode: boolean;
  private readonly maxQueueSize: number;

  constructor(endpoint = "/api/analytics", debugMode = false, maxQueueSize = 500) {
    this.endpoint = endpoint;
    this.debugMode = debugMode;
    this.maxQueueSize = maxQueueSize;
  }

  async send(payload: AnalyticsBackendPayload): Promise<void> {
    if (!this._canSend()) {
      this._enqueue(payload);
      return;
    }

    try {
      await fetch(this.endpoint, this._buildRequest(payload));
    } catch (error) {
      this._enqueue(payload);
      if (this.debugMode) {
        console.error("[Analytics] Backend send error, queued for retry:", error);
      }
    }
  }

  async flushWithFetcher(
    fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  ): Promise<void> {
    if (!this.queue.length) return;

    const queued = this.drainQueue();
    for (const payload of queued) {
      try {
        await fetcher(this.endpoint, this._buildRequest(payload));
      } catch (error) {
        this._enqueue(payload);
        if (this.debugMode) {
          console.error("[Analytics] Backend flush error, re-queued:", error);
        }
      }
    }
  }

  drainQueue(): AnalyticsBackendPayload[] {
    const queued = [...this.queue];
    this.queue.length = 0;
    return queued;
  }

  private _canSend(): boolean {
    return typeof fetch !== "undefined";
  }

  private _buildRequest(payload: AnalyticsBackendPayload): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  }

  private _enqueue(payload: AnalyticsBackendPayload): void {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      if (this.debugMode) {
        console.warn("[Analytics] Backend queue at capacity; dropped oldest payload.");
      }
    }
    this.queue.push(payload);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS SERVICE
// ══════════════════════════════════════════════════════════════════════════════

class AnalyticsService {
  private enabled: boolean;
  private debugMode: boolean;
  private sessionId: string;
  private userProperties: UserProperties = {};
  private backendClient: IsomorphicAnalyticsClient;
  private privacyConfig: AnalyticsPrivacyConfig;
  private envConfig: AnalyticsEnvConfig;
  private consentGranted: boolean;

  constructor() {
    const analyticsEnabledEnv = import.meta.env.VITE_ANALYTICS_ENABLED;
    const maxQueueSize = Number.parseInt(import.meta.env.VITE_ANALYTICS_MAX_QUEUE ?? "500", 10);
    this.enabled =
      analyticsEnabledEnv === "true" ||
      (analyticsEnabledEnv !== "false" && import.meta.env.PROD) ||
      import.meta.env.VITE_ANALYTICS_FORCE === "true";
    this.debugMode = import.meta.env.DEV;
    this.sessionId = this._generateSessionId();
    this.privacyConfig = {
      respectDnt: import.meta.env.VITE_ANALYTICS_RESPECT_DNT !== "false",
      requireConsent: import.meta.env.VITE_ANALYTICS_REQUIRE_CONSENT === "true",
      redactUserAgent: import.meta.env.VITE_ANALYTICS_REDACT_UA === "true",
      redactReferrer: import.meta.env.VITE_ANALYTICS_REDACT_REFERRER === "true",
    };
    this.envConfig = {
      backendEnabled: import.meta.env.VITE_ANALYTICS_BACKEND_ENABLED !== "false",
      gaEnabled: import.meta.env.VITE_ANALYTICS_GA_ENABLED !== "false",
      mixpanelEnabled: import.meta.env.VITE_ANALYTICS_MIXPANEL_ENABLED !== "false",
    };
    this.consentGranted = !this.privacyConfig.requireConsent;
    this.backendClient = new IsomorphicAnalyticsClient(
      "/api/analytics",
      this.debugMode,
      Number.isNaN(maxQueueSize) ? 500 : maxQueueSize
    );

    if (this.debugMode) {
      console.log("[Analytics] Initialized in debug mode");
      console.log("[Analytics] Session ID:", this.sessionId);
    }
  }

  /**
   * Track an event
   */
  track(event: AnalyticsEvent, properties?: EventProperties): void {
    const browserContext = this._getBrowserContext();
    const enrichedProperties = {
      ...properties,
      session_id: this.sessionId,
      timestamp: Date.now(),
      ...(browserContext.userAgent && !this.privacyConfig.redactUserAgent
        ? { user_agent: browserContext.userAgent }
        : {}),
      ...(typeof browserContext.screenWidth === "number"
        ? { screen_width: browserContext.screenWidth }
        : {}),
      ...(typeof browserContext.screenHeight === "number"
        ? { screen_height: browserContext.screenHeight }
        : {}),
      ...this.userProperties,
    };

    if (this.debugMode) {
      console.log(`[Analytics] 📊 ${event}`, enrichedProperties);
    }

    if (!this._isTrackingAllowed()) return;

    // Google Analytics 4
    this._sendToGA4(event, enrichedProperties);

    // Mixpanel
    this._sendToMixpanel(event, enrichedProperties);

    // Custom Backend
    this._sendToBackend(event, enrichedProperties);
  }

  /**
   * Identify a user
   */
  identify(userId: string, properties?: UserProperties): void {
    if (this.debugMode) {
      console.log("[Analytics] 👤 Identify user:", userId, properties);
    }

    this.userProperties = {
      ...this.userProperties,
      ...properties,
      user_id: userId,
    };

    if (!this._isTrackingAllowed()) return;

    // Mixpanel
    if (this.envConfig.mixpanelEnabled && typeof window !== "undefined" && "mixpanel" in window) {
      (window as any).mixpanel.identify(userId);
      if (properties) {
        (window as any).mixpanel.people.set(properties);
      }
    }

    // Google Analytics
    if (this.envConfig.gaEnabled && typeof window !== "undefined" && "gtag" in window) {
      (window as any).gtag("set", "user_id", userId);
      if (properties) {
        (window as any).gtag("set", "user_properties", properties);
      }
    }
  }

  /**
   * Track a page view
   */
  page(path: string, title?: string): void {
    const browserContext = this._getBrowserContext();
    this.track("page_view", {
      path,
      ...(title || browserContext.title ? { title: title || browserContext.title } : {}),
      ...(browserContext.referrer && !this.privacyConfig.redactReferrer
        ? { referrer: browserContext.referrer }
        : {}),
    });
  }

  /**
   * Track conversion/goal completion
   */
  conversion(goalName: string, value?: number, properties?: EventProperties): void {
    this.track("conversion" as AnalyticsEvent, {
      goal_name: goalName,
      value,
      ...properties,
    });

    // Google Analytics conversion
    if (
      this._isTrackingAllowed() &&
      this.envConfig.gaEnabled &&
      typeof window !== "undefined" &&
      "gtag" in window
    ) {
      (window as any).gtag("event", "conversion", {
        send_to: "AW-CONVERSION_ID", // Replace with your conversion ID
        value,
        currency: "USD",
        transaction_id: this._generateTransactionId(),
      });
    }
  }

  /**
   * Clear user identification (on logout)
   */
  reset(): void {
    if (this.debugMode) {
      console.log("[Analytics] 🔄 Reset user");
    }

    this.userProperties = {};

    if (!this._isTrackingAllowed()) return;

    // Mixpanel
    if (this.envConfig.mixpanelEnabled && typeof window !== "undefined" && "mixpanel" in window) {
      (window as any).mixpanel.reset();
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ────────────────────────────────────────────────────────────────────────────

  private _sendToGA4(event: string, properties: EventProperties): void {
    if (!this.envConfig.gaEnabled) return;
    if (typeof window === "undefined" || !("gtag" in window)) return;

    try {
      (window as any).gtag("event", event, properties);
    } catch (error) {
      console.error("[Analytics] GA4 error:", error);
    }
  }

  private _sendToMixpanel(event: string, properties: EventProperties): void {
    if (!this.envConfig.mixpanelEnabled) return;
    if (typeof window === "undefined" || !("mixpanel" in window)) return;

    try {
      (window as any).mixpanel.track(event, properties);
    } catch (error) {
      console.error("[Analytics] Mixpanel error:", error);
    }
  }

  private _sendToBackend(event: string, properties: EventProperties): void {
    if (!this.envConfig.backendEnabled) return;
    void this.backendClient.send({
      event,
      properties,
      timestamp: Date.now(),
    });
  }

  private _generateSessionId(): string {
    if (typeof crypto !== "undefined") {
      if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }

      const buffer = new Uint8Array(16);
      crypto.getRandomValues(buffer);
      return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private _generateTransactionId(): string {
    const nonce = Math.random().toString(36).slice(2, 11);
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `txn_${crypto.randomUUID()}`;
    }

    return `txn_${Date.now()}_${nonce}`;
  }

  private _isBrowser(): boolean {
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  private _isTrackingAllowed(): boolean {
    if (!this.enabled) return false;
    if (!this._hasConsent()) return false;
    if (this.privacyConfig.respectDnt && this._isDntEnabled()) return false;
    return true;
  }

  private _hasConsent(): boolean {
    if (!this.privacyConfig.requireConsent) return true;
    return this.consentGranted;
  }

  private _isDntEnabled(): boolean {
    if (!this._isBrowser()) return false;
    const dnt = (navigator as Navigator & { msDoNotTrack?: string }).doNotTrack ?? "unspecified";
    return dnt === "1" || dnt === "yes";
  }

  private _getBrowserContext(): {
    userAgent?: string;
    screenWidth?: number;
    screenHeight?: number;
    title?: string;
    referrer?: string;
  } {
    if (!this._isBrowser()) {
      return {};
    }

    const context: {
      userAgent?: string;
      screenWidth?: number;
      screenHeight?: number;
      title?: string;
      referrer?: string;
    } = {};

    if (typeof navigator !== "undefined" && navigator.userAgent) {
      context.userAgent = navigator.userAgent;
    }
    if (typeof window !== "undefined" && window.screen && window.screen.width !== undefined) {
      context.screenWidth = window.screen.width;
    }
    if (typeof window !== "undefined" && window.screen && window.screen.height !== undefined) {
      context.screenHeight = window.screen.height;
    }
    if (typeof document !== "undefined" && document.title) {
      context.title = document.title;
    }
    if (typeof document !== "undefined" && document.referrer) {
      context.referrer = document.referrer;
    }

    return context;
  }

  /**
   * Expose queued backend events for SSR environments to flush later.
   */
  drainQueuedBackendEvents(): AnalyticsBackendPayload[] {
    return this.backendClient.drainQueue();
  }

  /**
   * Flush queued backend events with a provided fetch implementation (e.g., from SSR runtime).
   */
  async flushBackendQueue(
    fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  ): Promise<void> {
    await this.backendClient.flushWithFetcher(fetcher);
  }

  /**
   * Update user consent state (e.g., after cookie banner interaction).
   */
  setConsent(granted: boolean): void {
    this.consentGranted = granted;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ══════════════════════════════════════════════════════════════════════════════

export const analytics = new AnalyticsService();

/**
 * SSR helper to flush queued backend events with a provided fetch implementation.
 */
export async function flushAnalyticsQueueWith(
  fetcher: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<void> {
  await analytics.flushBackendQueue(fetcher);
}

/**
 * Track page views automatically on route changes
 */
export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    analytics.page(location.pathname + location.search);
  }, [location]);
}

/**
 * Track wallet connection
 */
export function useWalletTracking(address?: string, chainId?: number) {
  useEffect(() => {
    if (address) {
      analytics.identify(address, {
        wallet_type: "metamask", // Could be dynamic
        ...(chainId !== undefined ? { chain_id: chainId } : {}),
      });
    } else {
      analytics.reset();
    }
  }, [address, chainId]);
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

type RoutingStrategy = "best_price" | "best_gas" | "balanced" | "custom";
type MevPath = "public" | "private" | "flashbots" | "mev_share";

/**
 * Track swap event with proper properties
 */
export function trackSwap(params: {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  chainId: number;
  status: "initiated" | "completed" | "failed";
  routingStrategy?: RoutingStrategy;
  routeId?: string;
  routePath?: string[];
  protocols?: string[];
  priceImpactBps?: number;
  slippageBps?: number;
  mevPath?: MevPath;
  gasConfig?: { maxFeePerGas?: number; maxPriorityFeePerGas?: number; gasLimit?: number };
  quoteSource?: string;
  oracleFallback?: string;
  txHash?: string;
  error?: string;
}) {
  const { status, ...properties } = params;

  const eventMap = {
    initiated: "swap_initiated",
    completed: "swap_completed",
    failed: "swap_failed",
  } as const;

  const payload: Record<string, string | number | boolean | null | undefined> = {
    from_token: properties.fromToken,
    to_token: properties.toToken,
    from_amount: properties.fromAmount,
    to_amount: properties.toAmount,
    chain_id: properties.chainId,
    slippage_bps: properties.slippageBps,
  };

  if (properties.routingStrategy) payload.routing_strategy = properties.routingStrategy;
  if (properties.routeId) payload.route_id = properties.routeId;
  if (properties.routePath) payload.route_path = properties.routePath.join(">");
  if (properties.protocols) payload.protocols = properties.protocols.join(",");
  if (properties.priceImpactBps !== undefined) payload.price_impact_bps = properties.priceImpactBps;
  if (properties.mevPath) payload.mev_path = properties.mevPath;
  if (properties.gasConfig?.maxFeePerGas !== undefined)
    payload.gas_max_fee_per_gas = properties.gasConfig.maxFeePerGas;
  if (properties.gasConfig?.maxPriorityFeePerGas !== undefined)
    payload.gas_max_priority_fee_per_gas = properties.gasConfig.maxPriorityFeePerGas;
  if (properties.gasConfig?.gasLimit !== undefined)
    payload.gas_limit = properties.gasConfig.gasLimit;
  if (properties.quoteSource) payload.quote_source = properties.quoteSource;
  if (properties.oracleFallback) payload.oracle_fallback = properties.oracleFallback;
  if (properties.txHash) payload.tx_hash = properties.txHash;
  if (properties.error) payload.error = properties.error;

  analytics.track(eventMap[status], payload);
}

/**
 * Track liquidity event
 */
export function trackLiquidity(params: {
  action: "add" | "remove";
  tokenA: string;
  tokenB: string;
  amountA: string;
  amountB: string;
  chainId: number;
  status: "initiated" | "completed";
}) {
  const { action, status, ...properties } = params;

  const event = `liquidity_${action}_${status}` as AnalyticsEvent;

  analytics.track(event, {
    token_a: properties.tokenA,
    token_b: properties.tokenB,
    amount_a: properties.amountA,
    amount_b: properties.amountB,
    chain_id: properties.chainId,
  });
}

/**
 * Track route computation/selection outcomes
 */
export function trackRouteDecision(params: {
  routeId: string;
  strategy: RoutingStrategy;
  protocols: string[];
  hops: number;
  estimatedGas?: number;
  estimatedOutput?: string;
  reason?: string;
  status: "computed" | "selected" | "failed";
}) {
  const eventMap: Record<typeof params.status, AnalyticsEvent> = {
    computed: "route_computed",
    selected: "route_selected",
    failed: "route_failed",
  };

  analytics.track(eventMap[params.status], {
    route_id: params.routeId,
    routing_strategy: params.strategy,
    protocols: params.protocols.join(","),
    hops: params.hops,
    estimated_gas: params.estimatedGas,
    estimated_output: params.estimatedOutput,
    reason: params.reason,
  });
}

/**
 * Track quote/oracle source selection and fallbacks
 */
export function trackQuoteSourceSelection(params: {
  primary: string;
  fallback?: string;
  oracleUsed?: string;
  oracleFallback?: string;
  discrepancyBps?: number;
}) {
  const payload: Record<string, string | number | boolean | null | undefined> = {
    primary_source: params.primary,
  };

  if (params.fallback !== undefined) payload.fallback_source = params.fallback;
  if (params.oracleUsed !== undefined) payload.oracle_used = params.oracleUsed;
  if (params.oracleFallback !== undefined) payload.oracle_fallback = params.oracleFallback;
  if (params.discrepancyBps !== undefined) payload.discrepancy_bps = params.discrepancyBps;

  analytics.track("quote_source_selected", payload);
}

/**
 * Track MEV protection toggles and gas config changes
 */
export function trackProtectionAndGas(params: {
  mevPath?: MevPath;
  mevEnabled?: boolean;
  gasConfig?: { maxFeePerGas?: number; maxPriorityFeePerGas?: number; gasLimit?: number };
  slippageBps?: number;
  autoSlippageReason?: string;
}) {
  if (params.mevPath !== undefined || params.mevEnabled !== undefined) {
    const payload: Record<string, string | number | boolean | null | undefined> = {};
    if (params.mevPath !== undefined) payload.mev_path = params.mevPath;
    if (params.mevEnabled !== undefined) payload.mev_enabled = params.mevEnabled;
    analytics.track("mev_protection_toggled", payload);
  }

  if (
    params.gasConfig?.maxFeePerGas !== undefined ||
    params.gasConfig?.maxPriorityFeePerGas !== undefined ||
    params.gasConfig?.gasLimit !== undefined ||
    params.slippageBps !== undefined
  ) {
    const payload: Record<string, string | number | boolean | null | undefined> = {};
    if (params.gasConfig?.maxFeePerGas !== undefined) {
      payload.gas_max_fee_per_gas = params.gasConfig.maxFeePerGas;
    }
    if (params.gasConfig?.maxPriorityFeePerGas !== undefined) {
      payload.gas_max_priority_fee_per_gas = params.gasConfig.maxPriorityFeePerGas;
    }
    if (params.gasConfig?.gasLimit !== undefined) {
      payload.gas_limit = params.gasConfig.gasLimit;
    }
    if (params.slippageBps !== undefined) payload.slippage_bps = params.slippageBps;
    if (params.autoSlippageReason !== undefined) {
      payload.auto_slippage_reason = params.autoSlippageReason;
    }
    analytics.track("gas_config_updated", payload);
  }
}
