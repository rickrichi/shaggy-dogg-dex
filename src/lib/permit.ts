// src/lib/permit.ts
import { type Address, type Hex, parseSignature, type PublicClient, type WalletClient } from "viem";

import FeeDiscountStakingAbiJson from "@/abi/FeeDiscountStaking.json";
// ─────────────────────────────────────────────────────────────────────────────
// ABIs (import the JSON from your Remix build artifacts)
// ─────────────────────────────────────────────────────────────────────────────
import ShaggyDoggTokenAbiJson from "@/abi/ShaggyDoggToken.json";

import type { Abi } from "abitype";

export type ShaggyDoggTokenAbi = typeof ShaggyDoggTokenAbiJson extends Abi
  ? typeof ShaggyDoggTokenAbiJson
  : never;

export type FeeDiscountStakingAbi = typeof FeeDiscountStakingAbiJson extends Abi
  ? typeof FeeDiscountStakingAbiJson
  : never;

const SDT_ABI = ShaggyDoggTokenAbiJson as ShaggyDoggTokenAbi;
const STAKING_ABI = FeeDiscountStakingAbiJson as FeeDiscountStakingAbi;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PermitDomain {
  name: string;
  version: "1" | "2" | string;
  chainId: number;
  verifyingContract: Address;
}

export interface PermitMessage {
  owner: Address;
  spender: Address;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface SignPermitArgs {
  publicClient: PublicClient;
  walletClient: WalletClient;
  token: Address; // SDT token address
  owner: Address; // msg.sender (signer)
  spender: Address; // FeeDiscountStaking contract address
  value: bigint; // amount to approve (18-decimals: use parseUnits if needed)
  deadline: bigint; // unix seconds (e.g., BigInt(Math.floor(Date.now()/1000) + 3600))
  // Optional overrides (will be fetched if omitted)
  tokenName?:
    | string // ERC20 name()
    | undefined; // ERC20 name()
  version?:
    | string // default "1" (OpenZeppelin ERC20Permit)
    | undefined; // default "1" (OpenZeppelin ERC20Permit)
}

export interface SignedPermitVRS {
  v: number;
  r: Hex;
  s: Hex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (type guards)
// ─────────────────────────────────────────────────────────────────────────────

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: signTypedData for EIP-2612 Permit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Signs an EIP-2612 permit for an ERC20Permit token.
 * Produces (v,r,s) ready for depositWithPermit(amount, deadline, v, r, s).
 */
export async function signPermit(args: SignPermitArgs): Promise<SignedPermitVRS> {
  const {
    publicClient,
    walletClient,
    token,
    owner,
    spender,
    value,
    deadline,
    tokenName,
    version = "1",
  } = args;

  // Ensure wallet has an account and chains line up
  const account = walletClient.account;
  if (!account) throw new Error("Wallet client has no account configured");
  if (account.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error("Owner must match connected wallet account");
  }

  const [chainId, name, nonce] = await Promise.all([
    publicClient.getChainId(),
    // name() is used for the EIP-712 domain; allow override
    tokenName && isNonEmptyString(tokenName)
      ? Promise.resolve(tokenName)
      : publicClient.readContract({
          address: token,
          abi: SDT_ABI,
          functionName: "name",
        }),
    // OZ ERC20Permit uses `nonces(owner)` (from Nonces)
    publicClient.readContract({
      address: token,
      abi: SDT_ABI,
      functionName: "nonces",
      args: [owner],
    }),
  ]);

  const domain: PermitDomain = {
    name,
    version,
    chainId,
    verifyingContract: token,
  };

  // Strict EIP-2612 Permit type (OpenZeppelin layout)
  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  } as const;

  const message: PermitMessage = {
    owner,
    spender,
    value,
    nonce: nonce as bigint,
    deadline,
  };

  const signature: Hex = await walletClient.signTypedData({
    account,
    domain,
    primaryType: "Permit",
    types,
    message,
  });

  const { v, r, s } = parseSignature(signature);
  if (typeof v !== "number") {
    throw new Error("Signature parsing failed: v is undefined or not a number");
  }
  return { v, r, s };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience: sign + depositWithPermit in one call
// ─────────────────────────────────────────────────────────────────────────────

export interface DepositWithPermitArgs extends Omit<SignPermitArgs, "spender"> {
  staking: Address; // FeeDiscountStaking contract
}

/**
 * Signs the permit for {token, owner -> staking} and then calls
 * FeeDiscountStaking.depositWithPermit(amount, deadline, v, r, s).
 */
export async function signAndDepositWithPermit(args: DepositWithPermitArgs): Promise<Hex> {
  const { publicClient, walletClient, token, owner, staking, value, deadline, tokenName, version } =
    args;

  // 1) Sign permit
  const { v, r, s } = await signPermit({
    publicClient,
    walletClient,
    token,
    owner,
    spender: staking,
    value,
    deadline,
    tokenName,
    version,
  });

  // 2) Execute depositWithPermit
  const hash = await walletClient.writeContract({
    address: staking,
    abi: STAKING_ABI,
    functionName: "depositWithPermit",
    args: [value, deadline, v, r, s],
    account: walletClient.account!,
    chain: undefined,
  });

  return hash;
}
