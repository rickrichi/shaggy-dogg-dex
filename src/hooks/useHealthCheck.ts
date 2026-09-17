/**
 * useHealthCheck Hook - Shaggy Dogg DEX
 *
 * React hook for monitoring API health using the Vercel Edge Function
 *
 * Features:
 * - Basic and detailed health checks
 * - Service status monitoring (API, database)
 * - Automatic polling with configurable interval
 * - Region and latency information
 *
 * @example
 * const { status, services, latency } = useHealthCheck({ detailed: true })
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type HealthStatus = "ok" | "degraded" | "down";
export type ServiceStatus = "operational" | "degraded" | "down";

export interface HealthResponse {
  status: HealthStatus;
  timestamp: number;
  version: string;
  uptime?: number;
  services?: {
    api: ServiceStatus;
    database: ServiceStatus;
  };
  region?: string;
  latency?: number;
}

export interface UseHealthCheckOptions {
  /**
   * Fetch detailed health info including service status
   * @default false
   */
  detailed?: boolean;

  /**
   * Auto-refresh interval in milliseconds
   * Set to 0 to disable auto-refresh
   * @default 30000 (30 seconds)
   */
  refreshInterval?: number;

  /**
   * Enable health check polling
   * @default true
   */
  enabled?: boolean;

  /**
   * Callback when status changes
   */
  onStatusChange?: (status: HealthStatus) => void;
}

export interface UseHealthCheckReturn {
  /** Health check data */
  data: HealthResponse | null;

  /** Overall health status */
  status: HealthStatus | null;

  /** Service statuses (only in detailed mode) */
  services: HealthResponse["services"] | null;

  /** API latency in ms (only in detailed mode) */
  latency: number | null;

  /** Server uptime in ms (only in detailed mode) */
  uptime: number | null;

  /** Deployment region (only in detailed mode) */
  region: string | null;

  /** API version */
  version: string | null;

  /** Loading state */
  loading: boolean;

  /** Error state */
  error: Error | null;

  /** Manually trigger health check */
  refresh: () => Promise<void>;

  /** Last update timestamp */
  lastUpdate: number | null;

  /** Is the system healthy? (status === 'ok') */
  isHealthy: boolean;
}

/**
 * Fetch health status from Vercel Edge Function
 */
export function useHealthCheck(options: UseHealthCheckOptions = {}): UseHealthCheckReturn {
  const {
    detailed = false,
    refreshInterval = 30000, // 30s default
    enabled = true,
    onStatusChange,
  } = options;

  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousStatusRef = useRef<HealthStatus | null>(null);

  /**
   * Fetch health data
   */
  const fetchHealth = useCallback(async (): Promise<void> => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    setLoading(true);
    setError(null);

    try {
      const url = detailed ? "/api/health?detailed=true" : "/api/health";

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      // Health endpoint returns 503 for degraded/down status
      const healthData: HealthResponse = await response.json();

      setData(healthData);
      setLastUpdate(Date.now());
      setError(null);

      // Call status change callback
      if (onStatusChange && previousStatusRef.current !== healthData.status) {
        onStatusChange(healthData.status);
      }
      previousStatusRef.current = healthData.status;
    } catch (err) {
      // Don't set error for aborted requests
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const error = err instanceof Error ? err : new Error("Failed to fetch health status");
      setError(error);
      console.error("[useHealthCheck] Error:", error);

      // Set status to down on error
      const downStatus: HealthResponse = {
        status: "down",
        timestamp: Date.now(),
        version: "unknown",
      };
      setData(downStatus);

      if (onStatusChange && previousStatusRef.current !== "down") {
        onStatusChange("down");
      }
      previousStatusRef.current = "down";
    } finally {
      setLoading(false);
    }
  }, [detailed, enabled, onStatusChange]);

  /**
   * Initial fetch on mount and when dependencies change
   */
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    fetchHealth();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchHealth, enabled]);

  /**
   * Auto-refresh interval
   */
  useEffect(() => {
    if (!enabled || refreshInterval <= 0) {
      return;
    }

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up new interval
    intervalRef.current = setInterval(() => {
      fetchHealth();
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchHealth, refreshInterval, enabled]);

  return {
    data,
    status: data?.status ?? null,
    services: data?.services ?? null,
    latency: data?.latency ?? null,
    uptime: data?.uptime ?? null,
    region: data?.region ?? null,
    version: data?.version ?? null,
    loading,
    error,
    refresh: fetchHealth,
    lastUpdate,
    isHealthy: data?.status === "ok",
  };
}

/**
 * Hook for monitoring service health with notifications
 */
export function useServiceMonitor(
  options: UseHealthCheckOptions & {
    /**
     * Show notification on status change
     * @default false
     */
    notify?: boolean;
  } = {}
) {
  const { notify = false, ...healthOptions } = options;

  const [alerts, setAlerts] = useState<
    Array<{ id: string; status: HealthStatus; timestamp: number }>
  >([]);

  const handleStatusChange = useCallback(
    (status: HealthStatus) => {
      if (notify && status !== "ok") {
        const alert = {
          id: `${Date.now()}-${status}`,
          status,
          timestamp: Date.now(),
        };
        setAlerts((prev) => [...prev, alert]);

        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
        }, 5000);
      }
    },
    [notify]
  );

  const health = useHealthCheck({
    ...healthOptions,
    onStatusChange: handleStatusChange,
  });

  return {
    ...health,
    alerts,
    clearAlerts: () => setAlerts([]),
  };
}

/**
 * Hook for checking if all services are operational
 */
export function useAllServicesHealthy(refreshInterval = 30000): boolean {
  const { services, loading } = useHealthCheck({
    detailed: true,
    refreshInterval,
  });

  if (loading || !services) {
    return false;
  }

  return services.api === "operational" && services.database === "operational";
}

/**
 * Hook for getting a simple up/down status
 */
export function useIsApiUp(refreshInterval = 30000): boolean {
  const { status, loading } = useHealthCheck({ refreshInterval });

  if (loading) {
    return true; // Assume up while loading
  }

  return status === "ok";
}
