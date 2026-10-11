// src/lib/launchpad/deployEngine.ts
import { type Address, parseEther, parseUnits, type PublicClient, type WalletClient } from "viem";

import { ERC20_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";

import { LAUNCHPAD_ARTIFACTS } from "./artifacts";
import { CANONICAL_BASE_CONTRACTS, DEX_VENUES } from "./constants";

import type { DeployedEcosystemResult, LaunchpadFormState } from "./types";

export async function executeLaunchpadDeployment(
  walletClient: WalletClient,
  publicClient: PublicClient,
  form: LaunchpadFormState,
  userAddress: Address
): Promise<DeployedEcosystemResult> {
  const adminWallet = CANONICAL_BASE_CONTRACTS.DeployerAdminWallet.toLowerCase();
  if (userAddress.toLowerCase() !== adminWallet) {
    throw new Error(
      `Deployment restricted: Only protocol administrator (${CANONICAL_BASE_CONTRACTS.DeployerAdminWallet}) can launch tokens.`
    );
  }

  const supplyUnits = parseUnits(form.initialSupply, form.decimals || 18);
  const recipient = (form.recipientAdminAddress?.trim() as Address) || userAddress;
  const activeChain = walletClient.chain;

  // ────────────────────────────────────────────────────────────────────────────
  // Step 1: Deploy Token (GovernanceToken.sol)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(`[Launchpad] Deploying token ${form.tokenName} (${form.tokenSymbol})...`);
  const tokenTxHash = await walletClient.deployContract({
    abi: LAUNCHPAD_ARTIFACTS.GovernanceToken.abi,
    bytecode: LAUNCHPAD_ARTIFACTS.GovernanceToken.bytecode,
    args: [
      form.tokenName,
      form.tokenSymbol,
      recipient, // Admin gets 100% supply
      recipient, // Minter
      supplyUnits,
    ],
    account: userAddress,
    chain: activeChain,
  });

  const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenTxHash });
  const tokenAddress = tokenReceipt.contractAddress;
  if (!tokenAddress)
    throw new Error("Token deployment transaction completed without a contract address.");
  console.log(`[Launchpad] Token deployed at: ${tokenAddress}`);

  let stakingAddress: Address | undefined;
  let vaultAddress: Address | undefined;
  let borrowerAddress: Address | undefined;
  let compoundVaultAddress: Address | undefined;
  const pairAddress: Address | undefined = undefined;

  // ────────────────────────────────────────────────────────────────────────────
  // Step 2: Deploy Staking if Archetype requires it
  // ────────────────────────────────────────────────────────────────────────────
  const needsStaking = [
    "staking_rewards",
    "moonwell_lending",
    "silo_isolated_vault",
    "aave_v3_yield",
    "full_defi_suite",
  ].includes(form.selectedArchetype);

  if (needsStaking) {
    console.log(`[Launchpad] Deploying FeeDiscountStaking for ${tokenAddress}...`);
    const stakingHash = await walletClient.deployContract({
      abi: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.abi,
      bytecode: LAUNCHPAD_ARTIFACTS.FeeDiscountStaking.bytecode,
      args: [tokenAddress, recipient, recipient],
      account: userAddress,
      chain: activeChain,
    });
    const stakingReceipt = await publicClient.waitForTransactionReceipt({ hash: stakingHash });
    stakingAddress = stakingReceipt.contractAddress ?? undefined;
    console.log(`[Launchpad] Staking contract deployed at: ${stakingAddress}`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Step 3: Deploy Vault if Archetype requires it
  // ────────────────────────────────────────────────────────────────────────────
  if (
    form.selectedArchetype === "moonwell_lending" ||
    form.selectedArchetype === "morpho_blue_isolated" ||
    form.selectedArchetype === "silo_isolated_vault" ||
    form.selectedArchetype === "fluid_hybrid_amm"
  ) {
    console.log(`[Launchpad] Deploying IsolatedLendingVault (ERC-4626) on Base...`);
    const vaultHash = await walletClient.deployContract({
      abi: LAUNCHPAD_ARTIFACTS.IsolatedLendingVault.abi,
      bytecode: LAUNCHPAD_ARTIFACTS.IsolatedLendingVault.bytecode,
      args: [
        `${form.tokenName} Isolated Vault`,
        `v${form.tokenSymbol}`,
        tokenAddress,
        stakingAddress ?? "0x0000000000000000000000000000000000000000",
        recipient,
        recipient,
      ],
      account: userAddress,
      chain: activeChain,
    });
    const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultHash });
    vaultAddress = vaultReceipt.contractAddress ?? undefined;
    console.log(`[Launchpad] Isolated Lending Vault deployed at: ${vaultAddress}`);
  } else if (form.selectedArchetype === "aave_v3_yield") {
    console.log(`[Launchpad] Deploying YieldStakingVault (Aave v3)...`);
    const vaultHash = await walletClient.deployContract({
      abi: LAUNCHPAD_ARTIFACTS.YieldStakingVault.abi,
      bytecode: LAUNCHPAD_ARTIFACTS.YieldStakingVault.bytecode,
      args: [
        CANONICAL_BASE_CONTRACTS.USDC,
        CANONICAL_BASE_CONTRACTS.AaveV3Pool,
        CANONICAL_BASE_CONTRACTS.aUSDC,
        stakingAddress ?? "0x0000000000000000000000000000000000000000",
        recipient,
        recipient,
      ],
      account: userAddress,
      chain: activeChain,
    });
    const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultHash });
    vaultAddress = vaultReceipt.contractAddress ?? undefined;
  } else if (form.selectedArchetype === "full_defi_suite") {
    console.log(`[Launchpad] Deploying YieldStakingVault (Aave v3) suite component...`);
    const vaultHash = await walletClient.deployContract({
      abi: LAUNCHPAD_ARTIFACTS.YieldStakingVault.abi,
      bytecode: LAUNCHPAD_ARTIFACTS.YieldStakingVault.bytecode,
      args: [
        CANONICAL_BASE_CONTRACTS.USDC,
        CANONICAL_BASE_CONTRACTS.AaveV3Pool,
        CANONICAL_BASE_CONTRACTS.aUSDC,
        stakingAddress ?? "0x0000000000000000000000000000000000000000",
        recipient,
        recipient,
      ],
      account: userAddress,
      chain: activeChain,
    });
    const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultHash });
    vaultAddress = vaultReceipt.contractAddress ?? undefined;
    console.log(`[Launchpad] Yield Staking Vault deployed at: ${vaultAddress}`);

    console.log(`[Launchpad] Deploying CompoundYieldVault suite component...`);
    const compHash = await walletClient.deployContract({
      abi: LAUNCHPAD_ARTIFACTS.CompoundYieldVault.abi,
      bytecode: LAUNCHPAD_ARTIFACTS.CompoundYieldVault.bytecode,
      args: [
        CANONICAL_BASE_CONTRACTS.USDC,
        CANONICAL_BASE_CONTRACTS.CompoundComet,
        stakingAddress ?? "0x0000000000000000000000000000000000000000",
        recipient,
        recipient,
      ],
      account: userAddress,
      chain: activeChain,
    });
    const compReceipt = await publicClient.waitForTransactionReceipt({ hash: compHash });
    compoundVaultAddress = compReceipt.contractAddress ?? undefined;
    console.log(`[Launchpad] Compound Yield Vault deployed at: ${compoundVaultAddress}`);

    console.log(`[Launchpad] Deploying AaveFlashBorrower suite component...`);
    const borrowerHash = await walletClient.deployContract({
      abi: LAUNCHPAD_ARTIFACTS.AaveFlashBorrower.abi,
      bytecode: LAUNCHPAD_ARTIFACTS.AaveFlashBorrower.bytecode,
      args: [CANONICAL_BASE_CONTRACTS.AaveV3Pool, recipient],
      account: userAddress,
      chain: activeChain,
    });
    const borrowerReceipt = await publicClient.waitForTransactionReceipt({ hash: borrowerHash });
    borrowerAddress = borrowerReceipt.contractAddress ?? undefined;
    console.log(`[Launchpad] Flash Loan Borrower deployed at: ${borrowerAddress}`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Step 4: Multi-DEX Liquidity Seeding (Optional)
  // ────────────────────────────────────────────────────────────────────────────
  if (form.enableDexSeeding && form.initialEthLiquidity && Number(form.initialEthLiquidity) > 0) {
    try {
      const venue = DEX_VENUES.find((v) => v.id === form.selectedDex) ?? DEX_VENUES[0]!;
      const router = venue.routerAddress;
      const ethAmount = parseEther(form.initialEthLiquidity);
      const tokenPercent = Math.min(Math.max(form.initialTokenLiquidityPercent || 50, 1), 100);
      const tokenAmount = (supplyUnits * BigInt(tokenPercent)) / 100n;

      console.log(
        `[Launchpad] Approving ${venue.name} router for ${tokenAmount.toString()} tokens...`
      );
      const approveHash = await walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [router, tokenAmount],
        account: userAddress,
        chain: activeChain,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      console.log(`[Launchpad] Adding initial liquidity to ${venue.name}...`);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins
      const liqHash = await walletClient.writeContract({
        address: router,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: "addLiquidityETH",
        args: [
          tokenAddress,
          tokenAmount,
          (tokenAmount * 95n) / 100n, // 5% slippage floor for initial seed
          (ethAmount * 95n) / 100n,
          recipient,
          deadline,
        ],
        value: ethAmount,
        account: userAddress,
        chain: activeChain,
      });
      await publicClient.waitForTransactionReceipt({ hash: liqHash });
      console.log(`[Launchpad] Liquidity added successfully to ${venue.name}!`);
    } catch (seedErr) {
      console.warn("[Launchpad] Liquidity seeding warning (token is already deployed):", seedErr);
    }
  }

  return {
    tokenAddress,
    stakingAddress,
    vaultAddress,
    borrowerAddress,
    compoundVaultAddress,
    pairAddress,
    txHash: tokenTxHash,
    deploymentMode: form.executionMode,
    archetype: form.selectedArchetype,
  };
}
