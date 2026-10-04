/**
 * Backwards-compatible entry point for the AI arbitrage modules.
 *
 * The implementations live in `lib/amm`; retain this module so legacy tooling
 * and imports that use `lib/ai-arbitrage-engine` resolve to the active code.
 */
export * from "./amm/ai-arbitrage-bot";
export * from "./amm/quant-ai-engine";
