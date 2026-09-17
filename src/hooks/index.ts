/**
 * Hooks Barrel Export - Shaggy Dogg DEX
 *
 * Central export point for all custom React hooks
 */

// Price hooks
export {
  type TokenPriceData,
  useTokenPrice,
  type UseTokenPriceOptions,
  type UseTokenPriceReturn,
  useTokenPrices,
} from "./useTokenPrice";

// Gas price hooks
export {
  type CostEstimate,
  type GasEstimate,
  type GasPrice,
  SUPPORTED_CHAINS,
  type SupportedChainId,
  useFormattedGasPrice,
  useGasPrice,
  type UseGasPriceOptions,
  type UseGasPriceReturn,
  useMultiChainGasPrices,
} from "./useGasPrice";

// Health check hooks
export {
  type HealthResponse,
  type HealthStatus,
  type ServiceStatus,
  useAllServicesHealthy,
  useHealthCheck,
  type UseHealthCheckOptions,
  type UseHealthCheckReturn,
  useIsApiUp,
  useServiceMonitor,
} from "./useHealthCheck";
