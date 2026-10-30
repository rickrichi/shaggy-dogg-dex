// src/pages/Paymaster.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Code2,
  Coins,
  Copy,
  Download,
  ExternalLink,
  Fuel,
  Layers,
  Lock,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Zap,
} from "lucide-react";
import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { base } from "viem/chains";

import { LaunchpadNav } from "@/components/launchpad/LaunchpadNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BASE_CHAINLINK_ETH_USD = "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70" as const;
const MRWD_TOKEN = "0xC17227AAa33C54634B6cE7AD0bf33A156563c179" as const;
const MRWD_V3_POOL = "0xa7D4D975988DAa77B46c5d637717e2dFE07FbDB5" as const;
const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;
const ENTRYPOINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" as const;
const PRICE_TIMEOUT_SECONDS = 4 * 3600; // 4 hours

const aggregatorAbi = parseAbi([
  "function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() external view returns (uint8)",
]);

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

interface ContractTier {
  id: "basic" | "single-oracle" | "dual-oracle" | "premium-oracle";
  badge: string;
  title: string;
  filename: string;
  contractName: string;
  summary: string;
  constructorArgs: string;
  highlights: string[];
  code: string;
}

const CONTRACT_TIERS: ContractTier[] = [
  {
    id: "basic",
    badge: "Tier 1 · Fixed / Admin Rate",
    title: "TokenGasPaymaster.sol",
    filename: "TokenGasPaymaster.sol",
    contractName: "TokenGasPaymaster",
    summary:
      "Reference ERC-4337 Paymaster using OpenZeppelin Account Abstraction Community Contracts with an owner-configurable tokenPriceExchangeRate.",
    constructorArgs: "(_entryPoint, _feeToken, _initialRate)",
    highlights: [
      "Inherits OpenZeppelin BasePaymaster and uses SafeERC20 for secure token transfers",
      "Stage 1 (_validatePaymasterUserOp): Checks user smart wallet token balance & allowance against maxTokenCost",
      "Stage 2 (_postOp): Reconciles actualGasCost, caps against maxTokenCost, and executes safeTransferFrom",
      "Owner-updatable updateExchangeRate(_newRate) for fixed or off-chain keeper pricing",
    ],
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BasePaymaster} from "@openzeppelin/contracts-user-ops/paymaster/BasePaymaster.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TokenGasPaymaster is BasePaymaster {
    using SafeERC20 for IERC20;

    IERC20 public immutable feeToken;
    uint256 public tokenPriceExchangeRate; // How many of your tokens equal 1 Native Gas Token (e.g., ETH)
    
    // Track execution context between validation and postOp
    struct PaymasterContext {
        uint256 maxTokenCost;
        address userSigner;
    }

    constructor(address _entryPoint, address _feeToken, uint256 _initialRate) 
        BasePaymaster(_entryPoint) 
    {
        feeToken = IERC20(_feeToken);
        tokenPriceExchangeRate = _initialRate;
    }

    /**
     * @notice Validates if the paymaster is willing to pay for this user operation.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        // Calculate how many of your custom tokens are needed to cover the maximum gas limit
        uint256 maxTokenCost = (maxCost * tokenPriceExchangeRate) / 1e18;

        // Verify the user's smart wallet holds enough of your token to cover the maximum cost
        uint256 userBalance = feeToken.balanceOf(userOp.sender);
        require(userBalance >= maxTokenCost, "Paymaster: Insufficient token balance for gas");

        // Verify the user has granted this paymaster contract sufficient ERC20 allowance
        uint256 allowance = feeToken.allowance(userOp.sender, address(this));
        require(allowance >= maxTokenCost, "Paymaster: Insufficient token allowance");

        // Pass this data down to the postOp execution phase
        context = abi.encode(PaymasterContext({
            maxTokenCost: maxTokenCost,
            userSigner: userOp.sender
        }));

        // Return 0 to validate success (no signature verification needed for basic token payment)
        return (context, 0);
    }

    /**
     * @notice Reimburses the paymaster with your token after the transaction completes.
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override {
        // If the inner user transaction reverted, we still charge them for the gas they wasted
        if (mode == PostOpMode.postOpReverted) return;

        PaymasterContext memory pmContext = abi.decode(context, (PaymasterContext));

        // Calculate the actual amount of your custom token spent based on actual gas used
        uint256 actualTokenCost = (actualGasCost * tokenPriceExchangeRate) / 1e18;

        // Ensure we don't accidentally pull more than what was approved during validation
        if (actualTokenCost > pmContext.maxTokenCost) {
            actualTokenCost = pmContext.maxTokenCost;
        }

        // Pull your custom tokens from the user's Smart Wallet into this Paymaster
        feeToken.safeTransferFrom(pmContext.userSigner, address(this), actualTokenCost);
    }

    /**
     * @notice Update the exchange rate (In production, replace with a Chainlink Oracle)
     */
    function updateExchangeRate(uint256 _newRate) external onlyOwner {
        tokenPriceExchangeRate = _newRate;
    }
}`,
  },
  {
    id: "single-oracle",
    badge: "Tier 2 · Single Chainlink Feed",
    title: "OracleGasPaymaster.sol",
    filename: "OracleGasPaymaster.sol",
    contractName: "OracleGasPaymaster",
    summary:
      "Dynamic ERC-4337 Paymaster querying a direct Chainlink AggregatorV3Interface feed with 4-hour stale-data heartbeat protection.",
    constructorArgs: "(_entryPoint, _feeToken, _priceFeed, _tokenDecimals)",
    highlights: [
      "Queries Chainlink latestRoundData() in both _validatePaymasterUserOp and _postOp",
      "Enforces PRICE_TIMEOUT = 4 hours heartbeat guardrail against stale or frozen feeds",
      "Validates price > 0 and answeredInRound >= roundId to block incomplete oracle rounds",
      "Re-fetches dynamic rate in _postOp to handle intra-block volatility while capping at maxTokenCost",
    ],
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BasePaymaster} from "@openzeppelin/contracts-user-ops/paymaster/BasePaymaster.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Import the official Chainlink interface
interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    function decimals() external view returns (uint8);
}

contract OracleGasPaymaster is BasePaymaster {
    using SafeERC20 for IERC20;

    IERC20 public immutable feeToken;
    AggregatorV3Interface public immutable priceFeed;
    
    uint256 public constant PRICE_TIMEOUT = 4 hours; // Heartbeat protection against stale data
    uint8 public immutable tokenDecimals;
    uint8 public immutable oracleDecimals;

    struct PaymasterContext {
        uint256 maxTokenCost;
        address userSigner;
    }

    /**
     * @param _entryPoint The global ERC-4337 EntryPoint contract.
     * @param _feeToken Your custom ERC-20 token address.
     * @param _priceFeed The Chainlink Aggregator address for Token/Native pair (or Token/USD).
     * @param _tokenDecimals The decimal count of your custom token (usually 18).
     */
    constructor(
        address _entryPoint, 
        address _feeToken, 
        address _priceFeed,
        uint8 _tokenDecimals
    ) 
        BasePaymaster(_entryPoint) 
    {
        feeToken = IERC20(_feeToken);
        priceFeed = AggregatorV3Interface(_priceFeed);
        tokenDecimals = _tokenDecimals;
        oracleDecimals = AggregatorV3Interface(_priceFeed).decimals();
    }

    /**
     * @notice Fetches the latest price from Chainlink and applies strict validation safety checks.
     * @return The dynamic exchange rate (amount of custom tokens per 1 unit of Native gas token).
     */
    function getDynamicExchangeRate() public view returns (uint256) {
        (
            uint80 roundId,
            int256 price,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        // Safety Guardrails: Prevent stale, broken, or manipulated oracle data
        require(price > 0, "Oracle: Invalid asset price");
        require(updatedAt >= block.timestamp - PRICE_TIMEOUT, "Oracle: Stale price feed data");
        require(answeredInRound >= roundId, "Oracle: Incomplete round data");

        // Normalize decimals between the Oracle, the Native Asset (18 decimals), and your Token
        // This calculates exactly how many custom tokens equal 1 Native Asset (like 1 ETH)
        return uint256(price); 
    }

    /**
     * @notice Validates if the user can cover the max potential gas cost at the current oracle rate.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        
        // Fetch real-time market price dynamically
        uint256 currentExchangeRate = getDynamicExchangeRate();

        // Calculate max token cost based on live oracle data
        uint256 maxTokenCost = (maxCost * currentExchangeRate) / (10 ** oracleDecimals);

        // Verify balance and contract allowance
        uint256 userBalance = feeToken.balanceOf(userOp.sender);
        require(userBalance >= maxTokenCost, "Paymaster: Insufficient dynamic token balance");

        uint256 allowance = feeToken.allowance(userOp.sender, address(this));
        require(allowance >= maxTokenCost, "Paymaster: Insufficient token allowance");

        context = abi.encode(PaymasterContext({
            maxTokenCost: maxTokenCost,
            userSigner: userOp.sender
        }));

        return (context, 0);
    }

    /**
     * @notice Claws back the precise amount of custom tokens matching the actual gas consumed.
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override {
        if (mode == PostOpMode.postOpReverted) return;

        PaymasterContext memory pmContext = abi.decode(context, (PaymasterContext));

        // Re-fetch dynamic rate to handle sharp intra-block price movements safely
        uint256 currentExchangeRate = getDynamicExchangeRate();
        
        // Convert the exact gas used into your custom token value
        uint256 actualTokenCost = (actualGasCost * currentExchangeRate) / (10 ** oracleDecimals);

        // Never exceed the validation threshold cap 
        if (actualTokenCost > pmContext.maxTokenCost) {
            actualTokenCost = pmContext.maxTokenCost;
        }

        // Pull the calculated tokens from the user's Account Abstraction Smart Account
        feeToken.safeTransferFrom(pmContext.userSigner, address(this), actualTokenCost);
    }
}`,
  },
  {
    id: "dual-oracle",
    badge: "Tier 3 · Dual-Feed Router",
    title: "DualOracleGasPaymaster.sol",
    filename: "DualOracleGasPaymaster.sol",
    contractName: "DualOracleGasPaymaster",
    summary:
      "Dual-Oracle Triangulation Router combining Token/USD and Native/USD (ETH/USD) feeds when a direct Token/ETH feed does not exist.",
    constructorArgs: "(_entryPoint, _feeToken, _tokenUsdFeed, _nativeUsdFeed)",
    highlights: [
      "Bridges two independent USD feeds: tokenUsdFeed (YourToken/USD) and nativeUsdFeed (ETH/USD)",
      "Computes triangulated cross-rate: exchangeRate = (uint256(nativePrice) * 1e18) / uint256(tokenPrice)",
      "Strict division-by-zero protection via require(tokenPrice > 0) and 4-hour heartbeat checks on both feeds",
      "Scales integer division by 1e18 prior to dividing to eliminate Solidity truncation loss",
    ],
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BasePaymaster} from "@openzeppelin/contracts-user-ops/paymaster/BasePaymaster.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

contract DualOracleGasPaymaster is BasePaymaster {
    using SafeERC20 for IERC20;

    IERC20 public immutable feeToken;
    
    // The two distinct Chainlink Data Feeds
    AggregatorV3Interface public immutable tokenUsdFeed;
    AggregatorV3Interface public immutable nativeUsdFeed;
    
    uint256 public constant PRICE_TIMEOUT = 4 hours; 
    uint256 public immutable nativeUsdDecimalsScalar;

    struct PaymasterContext {
        uint256 maxTokenCost;
        address userSigner;
    }

    /**
     * @param _entryPoint The global ERC-4337 EntryPoint contract.
     * @param _feeToken Your custom ERC-20 token address.
     * @param _tokenUsdFeed The Chainlink Aggregator for YourToken / USD.
     * @param _nativeUsdFeed The Chainlink Aggregator for Native Asset / USD (e.g., ETH/USD).
     */
    constructor(
        address _entryPoint, 
        address _feeToken, 
        address _tokenUsdFeed,
        address _nativeUsdFeed
    ) 
        BasePaymaster(_entryPoint) 
    {
        feeToken = IERC20(_feeToken);
        tokenUsdFeed = AggregatorV3Interface(_tokenUsdFeed);
        nativeUsdFeed = AggregatorV3Interface(_nativeUsdFeed);
        
        // Fetch the decimal resolution of the native feed (usually 8 decimals for USD pairs)
        uint8 nativeDecimals = AggregatorV3Interface(_nativeUsdFeed).decimals();
        nativeUsdDecimalsScalar = 10 ** nativeDecimals;
    }

    /**
     * @notice Fetches both USD values and computes the cross-rate safely.
     * @return The dynamic conversion multiplier scaled up to match the native asset's 18-decimal precision.
     */
    function getDynamicExchangeRate() public view returns (uint256) {
        // 1. Fetch Your Token / USD
        (uint80 tRoundId, int256 tokenPrice, , uint256 tUpdatedAt, uint80 tAnsweredInRound) = tokenUsdFeed.latestRoundData();
        require(tokenPrice > 0, "Oracle: Invalid custom token price");
        require(tUpdatedAt >= block.timestamp - PRICE_TIMEOUT, "Oracle: Custom token price feed stale");
        require(tAnsweredInRound >= tRoundId, "Oracle: Incomplete custom token round");

        // 2. Fetch Native Asset / USD (e.g., ETH / USD)
        (uint80 nRoundId, int256 nativePrice, , uint256 nUpdatedAt, uint80 nAnsweredInRound) = nativeUsdFeed.latestRoundData();
        require(nativePrice > 0, "Oracle: Invalid native asset price");
        require(nUpdatedAt >= block.timestamp - PRICE_TIMEOUT, "Oracle: Native asset price feed stale");
        require(nAnsweredInRound >= nRoundId, "Oracle: Incomplete native asset round");

        // 3. Mathematical Triangulation Cross-Rate Calculation
        // Example: If ETH = $3000 (3000 * 10^8) and Your Token = $0.50 (0.50 * 10^8)
        // (3000 * 10^8 * 10^18) / (0.50 * 10^8) = 6000 * 10^18 tokens per ETH.
        uint256 exchangeRate = (uint256(nativePrice) * 1e18) / uint256(tokenPrice);
        
        return exchangeRate;
    }

    /**
     * @notice Validates if the user can cover the max potential gas cost at the calculated dual-oracle rate.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        
        uint256 crossExchangeRate = getDynamicExchangeRate();

        // Standardize the cost extraction
        uint256 maxTokenCost = (maxCost * crossExchangeRate) / 1e18;

        uint256 userBalance = feeToken.balanceOf(userOp.sender);
        require(userBalance >= maxTokenCost, "Paymaster: Insufficient multi-oracle token balance");

        uint256 allowance = feeToken.allowance(userOp.sender, address(this));
        require(allowance >= maxTokenCost, "Paymaster: Insufficient token allowance");

        context = abi.encode(PaymasterContext({
            maxTokenCost: maxTokenCost,
            userSigner: userOp.sender
        }));

        return (context, 0);
    }

    /**
     * @notice Claws back the precise token amount derived from the final execution gas cost.
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override {
        if (mode == PostOpMode.postOpReverted) return;

        PaymasterContext memory pmContext = abi.decode(context, (PaymasterContext));
        uint256 crossExchangeRate = getDynamicExchangeRate();
        
        uint256 actualTokenCost = (actualGasCost * crossExchangeRate) / 1e18;

        if (actualTokenCost > pmContext.maxTokenCost) {
            actualTokenCost = pmContext.maxTokenCost;
        }

        feeToken.safeTransferFrom(pmContext.userSigner, address(this), actualTokenCost);
    }
}`,
  },
  {
    id: "premium-oracle",
    badge: "Tier 4 · Production + BPS Margin",
    title: "PremiumOracleGasPaymaster.sol",
    filename: "PremiumOracleGasPaymaster.sol",
    contractName: "PremiumOracleGasPaymaster",
    summary:
      "Full production Dual-Oracle Paymaster with adjustable Basis Points surcharge (0–2000 BPS hard-capped at 20%), revenue events, and fee withdrawal.",
    constructorArgs: "(_entryPoint, _feeToken, _tokenUsdFeed, _nativeUsdFeed, _initialPremium)",
    highlights: [
      "Basis Points (BPS) surcharge math (100 BPS = 1%, 500 BPS = 5%, BASIS_POINTS_DIVISOR = 10000)",
      "Immutable 20% hard-cap guardrail: require(_newPremium <= 2000) in both constructor and setPremium",
      "Emits PremiumUpdated and FeesCollected(user, actualTokenCost, premiumAmount) for on-chain accounting",
      "Includes onlyOwner withdrawFees(recipient, amount) to sweep accumulated protocol revenue",
    ],
    code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {BasePaymaster} from "@openzeppelin/contracts-user-ops/paymaster/BasePaymaster.sol";
import {PackedUserOperation} from "@openzeppelin/contracts/interfaces/draft-IERC4337.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function decimals() external view returns (uint8);
}

contract PremiumOracleGasPaymaster is BasePaymaster {
    using SafeERC20 for IERC20;

    IERC20 public immutable feeToken;
    AggregatorV3Interface public immutable tokenUsdFeed;
    AggregatorV3Interface public immutable nativeUsdFeed;
    
    uint256 public constant PRICE_TIMEOUT = 4 hours; 
    
    // Premium Configuration using Basis Points (100 = 1%, 500 = 5%, 10000 = 100%)
    uint256 public premiumPercentage; 
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    // Custom events to track protocol earnings
    event PremiumUpdated(uint256 oldPremium, uint256 newPremium);
    event FeesCollected(address indexed user, uint256 totalCharge, uint256 premiumAmount);

    struct PaymasterContext {
        uint256 maxTokenCost;
        address userSigner;
    }

    /**
     * @param _entryPoint The global ERC-4337 EntryPoint contract.
     * @param _feeToken Your custom ERC-20 token address.
     * @param _tokenUsdFeed The Chainlink Aggregator for YourToken / USD.
     * @param _nativeUsdFeed The Chainlink Aggregator for Native Asset / USD.
     * @param _initialPremium The initial surcharge in basis points (e.g., 500 for 5%).
     */
    constructor(
        address _entryPoint, 
        address _feeToken, 
        address _tokenUsdFeed,
        address _nativeUsdFeed,
        uint256 _initialPremium
    ) 
        BasePaymaster(_entryPoint) 
    {
        require(_initialPremium <= 2000, "Paymaster: Premium cannot exceed 20%");
        feeToken = IERC20(_feeToken);
        tokenUsdFeed = AggregatorV3Interface(_tokenUsdFeed);
        nativeUsdFeed = AggregatorV3Interface(_nativeUsdFeed);
        premiumPercentage = _initialPremium;
    }

    /**
     * @notice Allows the contract owner to dynamically adjust the platform surcharge.
     */
    function setPremium(uint256 _newPremium) external onlyOwner {
        require(_newPremium <= 2000, "Paymaster: Premium cannot exceed 20%");
        emit PremiumUpdated(premiumPercentage, _newPremium);
        premiumPercentage = _newPremium;
    }

    /**
     * @notice Fetches both USD values and computes the market cross-rate.
     */
    function getDynamicExchangeRate() public view returns (uint256) {
        (, int256 tokenPrice, , uint256 tUpdatedAt, ) = tokenUsdFeed.latestRoundData();
        require(tokenPrice > 0 && tUpdatedAt >= block.timestamp - PRICE_TIMEOUT, "Oracle: Invalid token price");

        (, int256 nativePrice, , uint256 nUpdatedAt, ) = nativeUsdFeed.latestRoundData();
        require(nativePrice > 0 && nUpdatedAt >= block.timestamp - PRICE_TIMEOUT, "Oracle: Invalid native price");

        return (uint256(nativePrice) * 1e18) / uint256(tokenPrice);
    }

    /**
     * @notice Calculates the total token fee required, fully incorporating the premium surcharge.
     */
    function calculateTokenCostWithPremium(uint256 nativeGasCost, uint256 crossExchangeRate) public view returns (uint256 totalCost, uint256 premiumAmount) {
        // 1. Find the baseline cost in custom tokens at strict market value
        uint256 baseTokenCost = (nativeGasCost * crossExchangeRate) / 1e18;

        // 2. Calculate the additional premium fee in basis points
        premiumAmount = (baseTokenCost * premiumPercentage) / BASIS_POINTS_DIVISOR;

        // 3. Combine them for the final user invoice
        totalCost = baseTokenCost + premiumAmount;
    }

    /**
     * @notice Validates user operations against the market price plus the protocol premium.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal view override returns (bytes memory context, uint256 validationData) {
        
        uint256 crossExchangeRate = getDynamicExchangeRate();
        (uint256 maxTokenCost, ) = calculateTokenCostWithPremium(maxCost, crossExchangeRate);

        // Ensure user has enough tokens and has given the contract sufficient allowance
        require(feeToken.balanceOf(userOp.sender) >= maxTokenCost, "Paymaster: Insufficient balance with premium");
        require(feeToken.allowance(userOp.sender, address(this)) >= maxTokenCost, "Paymaster: Insufficient allowance with premium");

        context = abi.encode(PaymasterContext({
            maxTokenCost: maxTokenCost,
            userSigner: userOp.sender
        }));

        return (context, 0);
    }

    /**
     * @notice Claws back the final calculated cost + premium from the user's account.
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override {
        if (mode == PostOpMode.postOpReverted) return;

        PaymasterContext memory pmContext = abi.decode(context, (PaymasterContext));
        uint256 crossExchangeRate = getDynamicExchangeRate();
        
        (uint256 actualTokenCost, uint256 premiumAmount) = calculateTokenCostWithPremium(actualGasCost, crossExchangeRate);

        // Enforce the validation-stage safety cap
        if (actualTokenCost > pmContext.maxTokenCost) {
            actualTokenCost = pmContext.maxTokenCost;
            // Recalculate premium relative to the capped maximum
            premiumAmount = (actualTokenCost * premiumPercentage) / (BASIS_POINTS_DIVISOR + premiumPercentage);
        }

        // Execute token transfer
        feeToken.safeTransferFrom(pmContext.userSigner, address(this), actualTokenCost);
        
        emit FeesCollected(pmContext.userSigner, actualTokenCost, premiumAmount);
    }

    /**
     * @notice Emergency withdrawal method for the owner to pull accumulated premium tokens.
     */
    function withdrawFees(address recipient, uint256 amount) external onlyOwner {
        feeToken.safeTransfer(recipient, amount);
    }
}`,
  },
];

const REFERENCE_LINKS = [
  {
    label: "MetaMask Tutorial: Use an ERC-20 Paymaster",
    href: "https://docs.metamask.io/tutorials/use-erc20-paymaster/",
  },
  {
    label: "OpenZeppelin Community Contracts: Paymasters",
    href: "https://docs.openzeppelin.com/community-contracts/paymasters",
  },
  {
    label: "Pimlico ERC-20 Paymaster Reference",
    href: "https://github.com/pimlicolabs/erc20-paymaster",
  },
  {
    label: "Alchemy: What is Account Abstraction (ERC-4337)?",
    href: "https://www.alchemy.com/overviews/what-is-account-abstraction",
  },
  {
    label: "Alchemy: What is a Paymaster?",
    href: "https://www.alchemy.com/overviews/what-is-a-paymaster",
  },
  {
    label: "Eco: What is a Paymaster? Gas Sponsorship Explained",
    href: "https://eco.com/support/en/articles/15254040-what-is-a-paymaster-gas-sponsorship-explained-2026",
  },
  {
    label: "Chainlink Price Feed Directory (Base Mainnet)",
    href: "https://docs.chain.link/data-feeds/price-feeds/addresses?network=base",
  },
] as const;

export default function Paymaster() {
  const [selectedTierId, setSelectedTierId] = useState<ContractTier["id"]>("premium-oracle");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Live Base Mainnet Oracle & Pool state
  const [isLoadingLive, setIsLoadingLive] = useState<boolean>(true);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(2279.63);
  const [ethRoundId, setEthRoundId] = useState<string>("—");
  const [ethUpdatedAt, setEthUpdatedAt] = useState<number>(Math.floor(Date.now() / 1000));
  const [mrwdPerEth, setMrwdPerEth] = useState<number>(3_784_300_000_000);
  const [baseGasGwei, setBaseGasGwei] = useState<number>(0.008);

  // Interactive Calculator Controls
  const [pricingMode, setPricingMode] = useState<"mrwd-live" | "custom-usd">("mrwd-live");
  const [customTokenSymbol, setCustomTokenSymbol] = useState<string>("CUSTOM");
  const [customTokenUsd, setCustomTokenUsd] = useState<string>("0.50");
  const [gasLimit, setGasLimit] = useState<number>(180_000);
  const [actualGasRatioPct, setActualGasRatioPct] = useState<number>(72);
  const [premiumBps, setPremiumBps] = useState<number>(500); // 5.00%

  const fetchLiveBaseMetrics = useCallback(async () => {
    setIsLoadingLive(true);
    try {
      const client = createPublicClient({
        chain: base,
        transport: http("https://mainnet.base.org"),
      });

      const [roundData, decimals, slot0, gasPriceWei] = await Promise.all([
        client.readContract({
          address: BASE_CHAINLINK_ETH_USD,
          abi: aggregatorAbi,
          functionName: "latestRoundData",
        }),
        client.readContract({
          address: BASE_CHAINLINK_ETH_USD,
          abi: aggregatorAbi,
          functionName: "decimals",
        }),
        client.readContract({
          address: MRWD_V3_POOL,
          abi: poolAbi,
          functionName: "slot0",
        }),
        client.getGasPrice(),
      ]);

      const ethUsd = Number(formatUnits(roundData[1], decimals));
      if (ethUsd > 0) {
        setEthUsdPrice(ethUsd);
      }
      setEthRoundId(roundData[0].toString());
      setEthUpdatedAt(Number(roundData[3]));

      // In pool 0xa7D4...bDB5, token0 = WETH (18), token1 = MRWD (18)
      const sqrtPriceX96 = Number(slot0[0]);
      const ratio = (sqrtPriceX96 / 2 ** 96) ** 2;
      if (ratio > 0 && Number.isFinite(ratio)) {
        setMrwdPerEth(ratio);
      }

      const gwei = Number(formatUnits(gasPriceWei, 9));
      if (gwei > 0) {
        setBaseGasGwei(gwei);
      }
    } catch {
      // Keep fallback values if RPC is temporarily unreachable
    } finally {
      setIsLoadingLive(false);
    }
  }, []);

  useEffect(() => {
    void fetchLiveBaseMetrics();
  }, [fetchLiveBaseMetrics]);

  const selectedTier = useMemo(
    () => CONTRACT_TIERS.find((t) => t.id === selectedTierId) ?? CONTRACT_TIERS[3]!,
    [selectedTierId]
  );

  // Simulator Calculations matching PremiumOracleGasPaymaster math
  const simulation = useMemo(() => {
    const parsedCustomUsd = Math.max(0.0000000001, Number(customTokenUsd) || 0.5);
    const tokenUsd =
      pricingMode === "mrwd-live"
        ? ethUsdPrice / Math.max(1, mrwdPerEth)
        : parsedCustomUsd;

    const tokensPerEth =
      pricingMode === "mrwd-live"
        ? mrwdPerEth
        : ethUsdPrice / parsedCustomUsd;

    const maxCostEth = (gasLimit * baseGasGwei) / 1e9;
    const maxCostUsd = maxCostEth * ethUsdPrice;

    const actualGasUnits = Math.round((gasLimit * actualGasRatioPct) / 100);
    const actualCostEth = (actualGasUnits * baseGasGwei) / 1e9;
    const actualCostUsd = actualCostEth * ethUsdPrice;

    // Stage 1 (_validatePaymasterUserOp): maxTokenCost with premium
    const maxBaseTokens = maxCostEth * tokensPerEth;
    const maxPremiumTokens = (maxBaseTokens * premiumBps) / 10_000;
    const maxTotalTokens = maxBaseTokens + maxPremiumTokens;

    // Stage 2 (_postOp): actualTokenCost with premium
    const actualBaseTokens = actualCostEth * tokensPerEth;
    const actualPremiumTokens = (actualBaseTokens * premiumBps) / 10_000;
    const actualTotalTokens = actualBaseTokens + actualPremiumTokens;

    const nowSec = Math.floor(Date.now() / 1000);
    const oracleAgeSec = Math.max(0, nowSec - ethUpdatedAt);
    const heartbeatFresh = oracleAgeSec <= PRICE_TIMEOUT_SECONDS;

    return {
      symbol: pricingMode === "mrwd-live" ? "MRWD" : customTokenSymbol || "TOKEN",
      tokenUsd,
      tokensPerEth,
      maxCostEth,
      maxCostUsd,
      actualGasUnits,
      actualCostEth,
      actualCostUsd,
      maxBaseTokens,
      maxPremiumTokens,
      maxTotalTokens,
      actualBaseTokens,
      actualPremiumTokens,
      actualTotalTokens,
      oracleAgeSec,
      heartbeatFresh,
    };
  }, [
    pricingMode,
    customTokenUsd,
    customTokenSymbol,
    ethUsdPrice,
    mrwdPerEth,
    gasLimit,
    baseGasGwei,
    actualGasRatioPct,
    premiumBps,
    ethUpdatedAt,
  ]);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadSolidity = (tier: ContractTier) => {
    const blob = new Blob([tier.code], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = tier.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTokenAmount = (amount: number) => {
    if (amount >= 1_000_000) {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    if (amount >= 1) {
      return amount.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    return amount.toLocaleString(undefined, { maximumFractionDigits: 8 });
  };

  return (
    <div className="min-h-[calc(100vh-80px)] space-y-6 p-4 duration-500 animate-in fade-in md:p-8">
      <LaunchpadNav />

      {/* Top Header */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 bg-clip-text text-3xl font-black text-transparent">
              ERC-4337 Token Gas Paymaster Studio
            </h1>
            <Badge className="border-indigo-200 bg-indigo-100 text-indigo-800">
              <Fuel className="mr-1 size-3.5" /> Account Abstraction · Base (8453)
            </Badge>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
              OpenZeppelin + Chainlink Oracles
            </Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
            Standard EOAs cannot natively pay network gas in an ERC-20 token. An{" "}
            <strong>ERC-4337 Paymaster Contract</strong> holds native ETH on the global{" "}
            <code>EntryPoint</code>, sponsors the user&apos;s gas upfront, and atomically pulls the
            equivalent amount of your custom ERC-20 token (such as <strong>$MRWD</strong>) from the
            user&apos;s Smart Account as reimbursement.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link to="/protocol">
            <Button size="sm" variant="outline" className="border-indigo-200 text-indigo-700">
              <Sparkles className="mr-1.5 size-4" /> Protocol Hub
            </Button>
          </Link>
          <Link to="/launchpad">
            <Button size="sm" variant="outline" className="border-slate-300 text-slate-700">
              <ArrowLeft className="mr-1.5 size-4" /> Token Studio
            </Button>
          </Link>
        </div>
      </div>

      {/* Canonical Base Mainnet ERC-4337 & Oracle Address Bar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-indigo-100 bg-white/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wide">ERC-4337 EntryPoint (v0.7)</span>
            <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-[10px] text-indigo-700">
              Base Canonical
            </Badge>
          </div>
          <p className="mt-1.5 truncate font-mono text-xs font-bold text-slate-900">
            {ENTRYPOINT_V07}
          </p>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span>v0.6: {ENTRYPOINT_V06.slice(0, 10)}…</span>
            <a
              href={`https://basescan.org/address/${ENTRYPOINT_V07}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
            >
              BaseScan <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-white/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wide">Chainlink ETH / USD (Base)</span>
            <Badge
              variant="outline"
              className={
                simulation.heartbeatFresh
                  ? "border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-[10px] text-amber-700"
              }
            >
              {simulation.heartbeatFresh ? "Heartbeat OK (<4h)" : "Stale Check"}
            </Badge>
          </div>
          <p className="mt-1 text-lg font-black text-slate-900">
            ${ethUsdPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-mono">{BASE_CHAINLINK_ETH_USD.slice(0, 10)}…Bb70</span>
            <a
              href={`https://basescan.org/address/${BASE_CHAINLINK_ETH_USD}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
            >
              Oracle <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-white/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wide">Mutt Rewards ($MRWD)</span>
            <Badge variant="outline" className="border-purple-200 bg-purple-50 text-[10px] text-purple-700">
              18 Decimals
            </Badge>
          </div>
          <p className="mt-1 text-sm font-black text-slate-900">
            {(mrwdPerEth / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })}B MRWD / ETH
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-mono">{MRWD_TOKEN.slice(0, 10)}…c179</span>
            <a
              href={`https://basescan.org/address/${MRWD_TOKEN}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:underline"
            >
              Token <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-white/90 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase tracking-wide">Base L2 Gas & Heartbeat</span>
            <button
              type="button"
              onClick={() => void fetchLiveBaseMetrics()}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline"
            >
              <RefreshCw className={`size-3 ${isLoadingLive ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
          <p className="mt-1 text-lg font-black text-slate-900">
            {baseGasGwei.toFixed(4)} <span className="text-xs font-semibold text-slate-500">Gwei</span>
          </p>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
            <span>Oracle Age: {simulation.oracleAgeSec}s</span>
            <span>Round #{ethRoundId.slice(-6)}</span>
          </div>
        </div>
      </div>

      {/* Architecture: Two-Stage ERC-4337 Process */}
      <Card className="border-purple-100 bg-white/95 shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Layers className="size-5 text-purple-600" />
              The Architecture: How an ERC-20 Paymaster Works
            </CardTitle>
            <Badge className="border-purple-200 bg-purple-50 text-purple-800">
              Two-Stage EntryPoint Execution
            </Badge>
          </div>
          <CardDescription>
            An ERC-4337 Paymaster operates via the global <code>EntryPoint</code> contract using a
            strict two-stage validation and post-execution settlement pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  Stage 1 · Pre-Execution
                </span>
                <code className="text-xs font-bold text-indigo-900">validatePaymasterUserOp()</code>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-slate-700">
                Runs <strong>before</strong> the user&apos;s transaction executes. It queries the
                exchange rate (via Chainlink Oracle or admin rate), calculates the{" "}
                <strong>maximum possible token fee</strong> (<code>maxTokenCost</code>) plus any BPS
                protocol margin, verifies that <code>userOp.sender</code> holds sufficient ERC-20
                balance and has granted <code>allowance</code> to the Paymaster, encodes{" "}
                <code>PaymasterContext</code>, and signals the <code>EntryPoint</code> that it will
                sponsor the gas in ETH.
              </p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  Stage 2 · Post-Execution
                </span>
                <code className="text-xs font-bold text-emerald-900">postOp()</code>
              </div>
              <p className="mt-2.5 text-xs leading-relaxed text-slate-700">
                Runs <strong>after</strong> the user&apos;s transaction executes. It decodes{" "}
                <code>PaymasterContext</code>, takes the <strong>exact gas actually spent</strong> (
                <code>actualGasCost</code>), re-queries the live oracle rate, translates the ETH gas
                into your ERC-20 token + BPS premium, enforces the validation cap (
                <code>actualTokenCost &lt;= pmContext.maxTokenCost</code>), and executes{" "}
                <code>feeToken.safeTransferFrom()</code> to reimburse the Paymaster.
              </p>
            </div>
          </div>

          {/* Mathematical Triangulation & BPS Formula Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-300">
                Dual-Oracle Cross-Rate Triangulation & Basis Points (BPS) Surcharge Formula
              </span>
              <span className="font-mono text-[11px] text-emerald-400">
                BASIS_POINTS_DIVISOR = 10,000 (Max Cap = 2,000 BPS / 20%)
              </span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 font-mono text-xs md:grid-cols-3">
              <div className="rounded-lg bg-slate-800/90 p-3">
                <p className="text-[10px] uppercase text-slate-400">1. Triangulated Cross-Rate</p>
                <p className="mt-1 text-emerald-300">
                  exchangeRate = (nativeUsdPrice * 1e18) / tokenUsdPrice
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Derives Tokens per 1 ETH from ETH/USD &amp; Token/USD feeds
                </p>
              </div>
              <div className="rounded-lg bg-slate-800/90 p-3">
                <p className="text-[10px] uppercase text-slate-400">2. Baseline Token Cost</p>
                <p className="mt-1 text-cyan-300">
                  baseTokenCost = (nativeGasCost * exchangeRate) / 1e18
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Converts wei gas spent into exact ERC-20 token units
                </p>
              </div>
              <div className="rounded-lg bg-slate-800/90 p-3">
                <p className="text-[10px] uppercase text-slate-400">3. Total Invoice with Premium</p>
                <p className="mt-1 text-amber-300">
                  totalCost = baseTokenCost + (baseTokenCost * bps) / 10000
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Protects against intra-block volatility &amp; generates protocol revenue
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Live Base Mainnet Paymaster Calculator & Simulator */}
      <Card className="border-indigo-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Sliders className="size-5 text-indigo-600" />
              Interactive Paymaster Fee &amp; BPS Margin Simulator (Live Base Mainnet Data)
            </CardTitle>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <Zap className="mr-1 size-3" /> Live Chainlink ETH/USD + Uniswap V3 Pool
            </Badge>
          </div>
          <CardDescription>
            Simulate <code>validatePaymasterUserOp</code> (max allowance check) and{" "}
            <code>postOp</code> (actual gas settlement + BPS protocol revenue) using live Base
            Mainnet Chainlink <code>ETH/USD</code> and canonical <code>MRWD/WETH</code> pool{" "}
            <code>0xa7D4…bDB5</code> rates—or test any custom USD token price.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Controls */}
            <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-700">
                  Fee Token Oracle Source
                </label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPricingMode("mrwd-live")}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                      pricingMode === "mrwd-live"
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div>$MRWD (Live Pool)</div>
                    <div
                      className={`text-[10px] ${
                        pricingMode === "mrwd-live" ? "text-indigo-100" : "text-slate-500"
                      }`}
                    >
                      Pool 0xa7D4…bDB5
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingMode("custom-usd")}
                    className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${
                      pricingMode === "custom-usd"
                        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <div>Custom ERC-20 / USD</div>
                    <div
                      className={`text-[10px] ${
                        pricingMode === "custom-usd" ? "text-indigo-100" : "text-slate-500"
                      }`}
                    >
                      Dual-Oracle Feed Simulation
                    </div>
                  </button>
                </div>
              </div>

              {pricingMode === "custom-usd" && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-indigo-100 bg-white p-3">
                  <div>
                    <label
                      htmlFor="custom-token-symbol"
                      className="block text-[11px] font-semibold text-slate-600"
                    >
                      Token Symbol
                    </label>
                    <input
                      id="custom-token-symbol"
                      type="text"
                      value={customTokenSymbol}
                      onChange={(e) => setCustomTokenSymbol(e.target.value.toUpperCase())}
                      className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="custom-token-usd"
                      className="block text-[11px] font-semibold text-slate-600"
                    >
                      Token Price (USD)
                    </label>
                    <input
                      id="custom-token-usd"
                      type="number"
                      step="0.01"
                      min="0.000001"
                      value={customTokenUsd}
                      onChange={(e) => setCustomTokenUsd(e.target.value)}
                      className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="gas-limit-slider" className="font-bold text-slate-700">
                    UserOperation Max Gas Limit
                  </label>
                  <span className="font-mono font-bold text-indigo-700">
                    {gasLimit.toLocaleString()} gas
                  </span>
                </div>
                <input
                  id="gas-limit-slider"
                  type="range"
                  min={50_000}
                  max={1_000_000}
                  step={10_000}
                  value={gasLimit}
                  onChange={(e) => setGasLimit(Number(e.target.value))}
                  className="mt-1.5 w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>50k (ERC-20 Transfer)</span>
                  <span>180k (DEX Swap)</span>
                  <span>1M (Complex Batch)</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="actual-gas-slider" className="font-bold text-slate-700">
                    Actual Gas Used in <code>postOp</code>
                  </label>
                  <span className="font-mono font-bold text-emerald-700">
                    {simulation.actualGasUnits.toLocaleString()} gas ({actualGasRatioPct}%)
                  </span>
                </div>
                <input
                  id="actual-gas-slider"
                  type="range"
                  min={25}
                  max={100}
                  step={1}
                  value={actualGasRatioPct}
                  onChange={(e) => setActualGasRatioPct(Number(e.target.value))}
                  className="mt-1.5 w-full accent-emerald-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs">
                  <label htmlFor="premium-bps-slider" className="font-bold text-slate-700">
                    Protocol Margin (<code>premiumPercentage</code>)
                  </label>
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-mono font-bold text-amber-900">
                    {premiumBps} BPS ({(premiumBps / 100).toFixed(2)}%)
                  </span>
                </div>
                <input
                  id="premium-bps-slider"
                  type="range"
                  min={0}
                  max={2000}
                  step={25}
                  value={premiumBps}
                  onChange={(e) => setPremiumBps(Number(e.target.value))}
                  className="mt-1.5 w-full accent-amber-600"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>0 BPS (0% At-Cost)</span>
                  <span>500 BPS (5% Recommended)</span>
                  <span>2000 BPS (20% Hard Cap)</span>
                </div>
              </div>
            </div>

            {/* Right Output Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-7">
              <div className="flex flex-col justify-between rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-indigo-600 text-white">
                      Stage 1 · _validatePaymasterUserOp
                    </Badge>
                    <span className="font-mono text-xs text-slate-500">Pre-Flight Check</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Minimum Smart Account balance &amp; ERC-20 allowance required before the bundler
                    accepts the <code>UserOperation</code>:
                  </p>
                  <div className="mt-3 rounded-lg border border-indigo-100 bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">
                      Max Required Balance / Allowance (<code>maxTokenCost</code>)
                    </div>
                    <div className="mt-1 text-xl font-black text-indigo-950">
                      {formatTokenAmount(simulation.maxTotalTokens)} {simulation.symbol}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Covers {simulation.maxCostEth.toFixed(8)} ETH (~$
                      {simulation.maxCostUsd.toFixed(4)} USD) max gas
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-indigo-100 pt-3 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Baseline Market Token Cost:</span>
                    <span className="font-mono font-semibold">
                      {formatTokenAmount(simulation.maxBaseTokens)} {simulation.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between text-amber-800">
                    <span>+ {premiumBps} BPS Volatility Buffer:</span>
                    <span className="font-mono font-semibold">
                      +{formatTokenAmount(simulation.maxPremiumTokens)} {simulation.symbol}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <Badge className="bg-emerald-600 text-white">Stage 2 · _postOp Settlement</Badge>
                    <span className="font-mono text-xs text-slate-500">Actual Clawback</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Exact tokens pulled via <code>feeToken.safeTransferFrom()</code> after execution
                    completes:
                  </p>
                  <div className="mt-3 rounded-lg border border-emerald-100 bg-white p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">
                      Final User Charge (<code>actualTokenCost</code>)
                    </div>
                    <div className="mt-1 text-xl font-black text-emerald-950">
                      {formatTokenAmount(simulation.actualTotalTokens)} {simulation.symbol}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Reimburses {simulation.actualCostEth.toFixed(8)} ETH (~$
                      {simulation.actualCostUsd.toFixed(4)} USD) spent
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 border-t border-emerald-100 pt-3 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Base Gas Reimbursement:</span>
                    <span className="font-mono font-semibold">
                      {formatTokenAmount(simulation.actualBaseTokens)} {simulation.symbol}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-emerald-800">
                    <span>Net Protocol Revenue (withdrawFees):</span>
                    <span className="font-mono">
                      +{formatTokenAmount(simulation.actualPremiumTokens)} {simulation.symbol}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4-Tier Solidity Contract Studio */}
      <Card className="border-purple-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
                <Code2 className="size-5 text-purple-600" />
                Solidity Smart Contract Implementations (4 Progressive Tiers)
              </CardTitle>
              <CardDescription className="mt-1">
                Select any of the 4 reference contracts below to inspect, copy, or download the
                complete Solidity source file (<code>^0.8.20</code>).
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCopy(selectedTier.id, selectedTier.code)}
                className="border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                {copiedId === selectedTier.id ? (
                  <>
                    <Check className="mr-1.5 size-4 text-emerald-600" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 size-4" /> Copy {selectedTier.filename}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                onClick={() => handleDownloadSolidity(selectedTier)}
                className="bg-purple-600 text-white hover:bg-purple-700"
              >
                <Download className="mr-1.5 size-4" /> Download .sol
              </Button>
            </div>
          </div>

          {/* Tier Selector Tabs */}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CONTRACT_TIERS.map((tier) => {
              const active = tier.id === selectedTierId;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-purple-600 bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-sm"
                      : "border-slate-200 bg-slate-50/70 text-slate-800 hover:border-purple-200 hover:bg-purple-50/50"
                  }`}
                >
                  <div
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      active ? "text-purple-100" : "text-purple-700"
                    }`}
                  >
                    {tier.badge}
                  </div>
                  <div className="mt-1 font-mono text-xs font-bold">{tier.title}</div>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-mono text-sm font-bold text-slate-900">
                  contract {selectedTier.contractName} is BasePaymaster
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">{selectedTier.summary}</p>
              </div>
              <Badge variant="outline" className="font-mono text-[11px]">
                constructor{selectedTier.constructorArgs}
              </Badge>
            </div>
            <ul className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-700 md:grid-cols-2">
              {selectedTier.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2 text-xs text-slate-300">
              <span className="font-mono font-semibold">{selectedTier.filename}</span>
              <span className="text-[11px] text-slate-400">Solidity ^0.8.20 · MIT License</span>
            </div>
            <pre className="max-h-[540px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-100">
              <code>{selectedTier.code}</code>
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Step-by-Step Deployment & Frontend Integration + Security Guardrails */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="border-indigo-100 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              <Coins className="size-5 text-indigo-600" />
              Step-by-Step Deployment &amp; User Integration
            </CardTitle>
            <CardDescription>
              How to deploy your Paymaster on Base Mainnet and wire it into an ERC-4337 Smart
              Account SDK (Biconomy, ZeroDev, Pimlico, or Safe).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-xs text-slate-700">
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3.5">
              <h4 className="font-bold text-indigo-950">Phase 1: Deploy &amp; Fund on EntryPoint</h4>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 leading-relaxed">
                <li>
                  <strong>Deploy ERC-20 Token:</strong> Use your deployed token (e.g.{" "}
                  <code>$MRWD</code> at <code>{MRWD_TOKEN}</code>).
                </li>
                <li>
                  <strong>Deploy Paymaster Contract:</strong> Pass the Base{" "}
                  <code>EntryPoint</code> address (<code>{ENTRYPOINT_V07}</code>), your token
                  address, and your Chainlink oracle feed address(es).
                </li>
                <li>
                  <strong>Crucial Step — Deposit Native ETH:</strong> Call{" "}
                  <code>deposit()</code> on the Paymaster (or <code>depositTo(paymaster)</code> on
                  the <code>EntryPoint</code>) to fund its native ETH gas pool. The Paymaster pays
                  user gas from this ETH pool and reimburses itself in your ERC-20 token.
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-purple-100 bg-purple-50/40 p-3.5">
              <h4 className="font-bold text-purple-950">
                Phase 2: User Integration (Smart Account / Bundler SDK)
              </h4>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 leading-relaxed">
                <li>
                  <strong>Smart Account Wallet:</strong> Users execute via an ERC-4337 Smart
                  Account (Biconomy, ZeroDev, Coinbase Smart Wallet, or Safe) rather than a plain
                  EOA.
                </li>
                <li>
                  <strong>Approve Paymaster:</strong> Have the Smart Account sign an{" "}
                  <code>approve(paymasterAddress, amount)</code> call on your ERC-20 token (can be
                  batched inside the same <code>UserOperation</code>!).
                </li>
                <li>
                  <strong>Build UserOperation &amp; Attach Paymaster:</strong> Populate{" "}
                  <code>paymasterAndData</code> with your deployed Paymaster contract address.
                </li>
                <li>
                  <strong>Submit to Bundler:</strong> Send the <code>UserOperation</code> to a Base
                  bundler. The bundler triggers <code>validatePaymasterUserOp</code>, executes the
                  call, and <code>postOp</code> transfers your ERC-20 token to the Paymaster.
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-100 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-slate-900">
              <ShieldCheck className="size-5 text-emerald-600" />
              Critical Architectural &amp; Security Guardrails
            </CardTitle>
            <CardDescription>
              Production safeguards built into the Chainlink single-oracle, dual-oracle, and BPS
              premium contracts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs text-slate-700">
            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-slate-900">
                  1. Stale Data Heartbeat Guardrail (<code>PRICE_TIMEOUT = 4 hours</code>)
                </p>
                <p className="mt-0.5 leading-relaxed text-slate-600">
                  Checks <code>require(updatedAt &gt;= block.timestamp - PRICE_TIMEOUT)</code> and{" "}
                  <code>require(answeredInRound &gt;= roundId)</code>. If network congestion or
                  oracle downtime delays price updates beyond 4 hours, the Paymaster safely reverts
                  rather than sponsoring gas at obsolete prices.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-indigo-600" />
              <div>
                <p className="font-bold text-slate-900">
                  2. Division-by-Zero &amp; Mismatched Decimal Protection
                </p>
                <p className="mt-0.5 leading-relaxed text-slate-600">
                  Enforces <code>require(tokenPrice &gt; 0)</code> and{" "}
                  <code>require(nativePrice &gt; 0)</code> before computing{" "}
                  <code>(uint256(nativePrice) * 1e18) / uint256(tokenPrice)</code>, preventing
                  division-by-zero panics and preserving full 18-decimal precision across 8-decimal
                  Chainlink USD feeds.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div>
                <p className="font-bold text-slate-900">
                  3. Surcharge Ceiling Guardrail (<code>require(_newPremium &lt;= 2000)</code>)
                </p>
                <p className="mt-0.5 leading-relaxed text-slate-600">
                  Both the constructor and <code>setPremium()</code> enforce an immutable 20%
                  (2,000 BPS) hard ceiling. Even if an admin key is compromised, the surcharge can
                  never be raised to 100% to drain user token balances.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reference Documentation & Citations */}
      <Card className="border-slate-200 bg-white/90 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold text-slate-800">
            Official ERC-4337 Paymaster &amp; Oracle References
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {REFERENCE_LINKS.map((ref) => (
              <a
                key={ref.href}
                href={ref.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700"
              >
                {ref.label}
                <ExternalLink className="size-3" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
