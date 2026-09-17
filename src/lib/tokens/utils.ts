// src/tokens/utils.ts

export interface Token {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
}

export function getTokenBySymbolOrThrow(list: readonly Token[], symbol: string): Token {
  const t = list.find((x) => x.symbol.toLowerCase() === symbol.toLowerCase());
  if (!t) {
    throw new Error(`Token not found for symbol=${symbol}`);
  }
  return t;
}

export function headOrThrow<T>(xs: readonly T[], label = "array"): T {
  if (xs.length === 0) throw new Error(`Expected non-empty ${label}`);
  return xs[0] as T;
}
