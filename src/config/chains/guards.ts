import { SUPPORTED_CHAIN_IDS, type SupportedChainId } from './types';
import { CHAIN_CONFIG } from './config';

/** Runtime guard + type predicate for SupportedChainId */
export function isSupportedChain(id: number): id is SupportedChainId {
  return SUPPORTED_CHAIN_IDS.includes(id as SupportedChainId);
}

/** Throws with a helpful message while refining the type */
export function assertSupportedChain(id: number): asserts id is SupportedChainId {
  if (!isSupportedChain(id)) {
    const allowed = SUPPORTED_CHAIN_IDS.join(', ');
    throw new Error(`Unsupported chain id: ${id}. Supported: [${allowed}]`);
  }
}

/** Parse unknown → SupportedChainId | null (no throw) */
export function parseSupportedChainId(value: unknown): SupportedChainId | null {
  if (typeof value !== 'number') return null;
  return isSupportedChain(value) ? value : null;
}

/** Safe accessors that never let undefined be used as an index */
export function getChainConfig(id: SupportedChainId) {
  return CHAIN_CONFIG[id];
}

/** Strict variant from a number (throws if unsupported) */
export function getChainConfigStrict(id: number) {
  assertSupportedChain(id);
  return CHAIN_CONFIG[id];
}
