import { maxUint256 } from "viem";

import type { LaunchpadFormState } from "./types";

export const TOKEN_SYMBOL_MIN_LENGTH = 2;
export const TOKEN_SYMBOL_MAX_LENGTH = 6;
export const MAX_WHOLE_TOKEN_SUPPLY = maxUint256 / 10n ** 18n;

export interface TokenIdentityErrors {
  tokenName?: string;
  tokenSymbol?: string;
  initialSupply?: string;
}

export function tokenIdentityErrors(
  form: Pick<LaunchpadFormState, "tokenName" | "tokenSymbol" | "initialSupply" | "decimals">
): TokenIdentityErrors {
  const errors: TokenIdentityErrors = {};
  const tokenName = form.tokenName.trim();
  const tokenSymbol = form.tokenSymbol.trim();
  const initialSupply = form.initialSupply.trim();

  if (!tokenName) {
    errors.tokenName = "Token name is required.";
  }

  if (!tokenSymbol) {
    errors.tokenSymbol = "Token symbol is required.";
  } else if (!/^[A-Z0-9]{2,6}$/.test(tokenSymbol)) {
    errors.tokenSymbol = "Use 2–6 uppercase letters or numbers (A–Z, 0–9).";
  }

  if (!initialSupply) {
    errors.initialSupply = "Total supply is required.";
  } else if (!/^[1-9]\d*$/.test(initialSupply)) {
    errors.initialSupply = "Total supply must be a positive whole number.";
  } else if (form.decimals !== 18) {
    errors.initialSupply = "Launchpad tokens must use 18 decimals.";
  } else if (BigInt(initialSupply) > MAX_WHOLE_TOKEN_SUPPLY) {
    errors.initialSupply = `Total supply cannot exceed ${MAX_WHOLE_TOKEN_SUPPLY.toString()}.`;
  }

  return errors;
}

export function tokenIdentityProblem(
  form: Pick<LaunchpadFormState, "tokenName" | "tokenSymbol" | "initialSupply" | "decimals">
): string | null {
  const errors = tokenIdentityErrors(form);
  return errors.tokenName ?? errors.tokenSymbol ?? errors.initialSupply ?? null;
}

export function isTokenIdentityValid(
  form: Pick<LaunchpadFormState, "tokenName" | "tokenSymbol" | "initialSupply" | "decimals">
): boolean {
  return tokenIdentityProblem(form) === null;
}
