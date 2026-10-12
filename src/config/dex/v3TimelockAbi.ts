// src/config/dex/v3TimelockAbi.ts
import { type Address } from "viem";

export const SOVEREIGN_V3_TIMELOCK_ADDRESS: Address = "0xb5c9bedb57f4e348e40a5e6326c90de474072e25";

export const SOVEREIGN_V3_TIMELOCK_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_positionManager", type: "address", internalType: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "extendLock",
    inputs: [
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "newUnlockTimestamp", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getLock",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "unlockTimestamp", type: "uint256", internalType: "uint256" },
      { name: "lockedAt", type: "uint256", internalType: "uint256" },
      { name: "isLockedActive", type: "bool", internalType: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "harvestTradingFees",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "amount0", type: "uint256", internalType: "uint256" },
      { name: "amount1", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isLocked",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "lockPosition",
    inputs: [
      { name: "tokenId", type: "uint256", internalType: "uint256" },
      { name: "unlockTimestamp", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "locks",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "unlockTimestamp", type: "uint256", internalType: "uint256" },
      { name: "lockedAt", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "positionManager",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract INonfungiblePositionManager" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "event",
    name: "FeesHarvested",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "recipient", type: "address", indexed: true, internalType: "address" },
      { name: "amount0", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "amount1", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "LockExtended",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "oldUnlockTimestamp", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "newUnlockTimestamp", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PositionLocked",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
      { name: "unlockTimestamp", type: "uint256", indexed: false, internalType: "uint256" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "PositionWithdrawn",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "owner", type: "address", indexed: true, internalType: "address" },
    ],
    anonymous: false,
  },
] as const;

export const ERC721_MINIMAL_ABI = [
  {
    type: "function",
    name: "ownerOf",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getApproved",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      { name: "owner", type: "address", internalType: "address" },
      { name: "operator", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "to", type: "address", internalType: "address" },
      { name: "tokenId", type: "uint256", internalType: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      { name: "operator", type: "address", internalType: "address" },
      { name: "approved", type: "bool", internalType: "bool" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const V3_POSITION_MANAGER_ABI = [
  ...ERC721_MINIMAL_ABI,
  {
    type: "function",
    name: "positions",
    inputs: [{ name: "tokenId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96", internalType: "uint96" },
      { name: "operator", type: "address", internalType: "address" },
      { name: "token0", type: "address", internalType: "address" },
      { name: "token1", type: "address", internalType: "address" },
      { name: "fee", type: "uint24", internalType: "uint24" },
      { name: "tickLower", type: "int24", internalType: "int24" },
      { name: "tickUpper", type: "int24", internalType: "int24" },
      { name: "liquidity", type: "uint128", internalType: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256", internalType: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256", internalType: "uint256" },
      { name: "tokensOwed0", type: "uint128", internalType: "uint128" },
      { name: "tokensOwed1", type: "uint128", internalType: "uint128" },
    ],
    stateMutability: "view",
  },
] as const;
