import {
  type Address,
  formatUnits,
  parseAbi,
  parseEther,
  parseUnits,
  type PublicClient,
  type WalletClient,
  zeroAddress,
} from "viem";
import { base } from "viem/chains";

import { ERC20_ABI, UNISWAP_V2_ROUTER_ABI } from "@/config/abis";
import { buildV3MintCall } from "@/lib/amm/uniswap-v3";

import { LAUNCHPAD_ARTIFACTS } from "./artifacts";
import {
  AERODROME_ROUTER_ABI,
  CANONICAL_BASE_CONTRACTS,
  DEX_VENUES,
  LAUNCHPAD_FEES_ABI,
} from "./constants";
import { tokenIdentityProblem } from "./identity";
import { seedingProblem } from "./seeding";
import { deploysStaking, deploysYieldVault, launchSettingsProblem, stakingTiers } from "./settings";

import type { DeployedEcosystemResult, LaunchpadFormState } from "./types";

export async function executeLaunchpadDeployment(
  walletClient: WalletClient,
  publicClient: PublicClient,
  form: LaunchpadFormState,
  userAddress: Address
): Promise<DeployedEcosystemResult> {
  if (publicClient.chain?.id !== 8453 || (await walletClient.getChainId()) !== 8453) {
    throw new Error("Launchpad deployment requires Base Mainnet");
  }
  const identityProblem = tokenIdentityProblem(form);
  if (identityProblem) throw new Error(identityProblem);
  if (
    form.enableDexSeeding &&
    form.recipientAdminAddress &&
    form.recipientAdminAddress.toLowerCase() !== userAddress.toLowerCase()
  ) {
    throw new Error("Initial liquidity must be seeded by the wallet receiving the token supply");
  }
  const seedProblem = seedingProblem(form);
  if (seedProblem) throw new Error(seedProblem);
  const settingsProblem = launchSettingsProblem(form);
  if (settingsProblem) throw new Error(settingsProblem);

  const supplyUnits = parseUnits(form.initialSupply, form.decimals || 18);
  const recipient = (form.recipientAdminAddress?.trim() as Address) || userAddress;
  const activeChain = base;

  // Checked first: the fee is charged after the token deploys, so a short wallet must not start.
  const currentLaunchFee = await publicClient.readContract({
    address: CANONICAL_BASE_CONTRACTS.LaunchpadFees,
    abi: LAUNCHPAD_FEES_ABI,
    functionName: "feeAmount",
  });
  if (currentLaunchFee > 0n) {
    const usdcBalance = (await publicClient.readContract({
      address: CANONICAL_BASE_CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [userAddress],
    })) as bigint;
    if (usdcBalance < currentLaunchFee) {
      throw new Error(
        `The launch fee is ${formatUnits(currentLaunchFee, 6)} USDC and this wallet holds ` +
          `${formatUnits(usdcBalance, 6)} USDC. Nothing was deployed.`
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Step 1: Deploy Token (FixedSupplyToken.sol: whole supply minted once, no mint or admin)
  // ────────────────────────────────────────────────────────────────────────────
  console.log(`[Launchpad] Deploying token ${form.tokenName} (${form.tokenSymbol})...`);
  const tokenTxHash = await walletClient.deployContract({
    abi: LAUNCHPAD_ARTIFACTS.FixedSupplyToken.abi,
    bytecode: LAUNCHPAD_ARTIFACTS.FixedSupplyToken.bytecode,
    args: [form.tokenName, form.tokenSymbol, recipient, supplyUnits], // Recipient gets 100% supply
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
  let liquiditySeedingError: string | undefined;
  const confirm = async (hash: `0x${string}`) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Transaction reverted");
  };

  // ────────────────────────────────────────────────────────────────────────────
  // Step 1.5: Pay the launchpad fee (LaunchpadFees.sol)
  // Uses the live fee read above, so changing LaunchpadFees.setFee() on-chain never requires a
  // frontend redeploy. Skips entirely if the fee is 0.
  // ────────────────────────────────────────────────────────────────────────────
  if (currentLaunchFee > 0n) {
    console.log(`[Launchpad] Approving USDC for the launch fee...`);
    const approveFeeHash = await walletClient.writeContract({
      address: CANONICAL_BASE_CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CANONICAL_BASE_CONTRACTS.LaunchpadFees, currentLaunchFee],
      account: userAddress,
      chain: activeChain,
    });
    await confirm(approveFeeHash);

    console.log(`[Launchpad] Paying launch fee...`);
    const feeTxHash = await walletClient.writeContract({
      address: CANONICAL_BASE_CONTRACTS.LaunchpadFees,
      abi: LAUNCHPAD_FEES_ABI,
      functionName: "payLaunchFee",
      args: [tokenAddress],
      account: userAddress,
      chain: activeChain,
    });
    await confirm(feeTxHash);
    console.log(`[Launchpad] Launch fee paid.`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Step 2: Staking and vaults, created and configured in one transaction so a rejected signature
  // can never leave a half-configured deployment. Everything is owned by the recipient on return.
  // ────────────────────────────────────────────────────────────────────────────
  if (deploysStaking(form.selectedArchetype)) {
    const { abi, bytecode } = LAUNCHPAD_ARTIFACTS.LaunchpadSuiteDeployer;
    const fullSuite = form.selectedArchetype === "full_defi_suite";
    let suiteAddress: Address;
    try {
      const suiteHash = await walletClient.deployContract({
        abi,
        bytecode,
        args: [
          {
            token: tokenAddress,
            admin: recipient,
            lockSeconds: BigInt(form.stakingLockDays) * 86_400n,
            unstakeFeeBps: form.earlyUnstakeFeeBps,
            performanceFeeBps: form.performanceFeeBps,
            tiers: stakingTiers(supplyUnits),
            deployAaveVault: deploysYieldVault(form.selectedArchetype),
            deployFullSuite: fullSuite,
            usdc: CANONICAL_BASE_CONTRACTS.USDC,
            aavePool: CANONICAL_BASE_CONTRACTS.AaveV3Pool,
            aUsdc: CANONICAL_BASE_CONTRACTS.aUSDC,
            comet: CANONICAL_BASE_CONTRACTS.CompoundComet,
          },
        ],
        account: userAddress,
        chain: activeChain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: suiteHash });
      if (receipt.status !== "success" || !receipt.contractAddress) {
        throw new Error("Transaction reverted");
      }
      suiteAddress = receipt.contractAddress;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "transaction failed";
      throw new Error(
        `Token ${tokenAddress} is deployed, but its staking contracts were not: ${reason}`
      );
    }
    const suiteAddressOf = async (functionName: string) => {
      const value = (await publicClient.readContract({
        address: suiteAddress,
        abi,
        functionName,
      })) as Address;
      return value === zeroAddress ? undefined : value;
    };
    stakingAddress = await suiteAddressOf("staking");
    vaultAddress = await suiteAddressOf("aaveVault");
    compoundVaultAddress = await suiteAddressOf("compoundVault");
    borrowerAddress = await suiteAddressOf("arbitrageRouter");
    console.log(`[Launchpad] Suite deployed by ${suiteAddress}`);
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

      if (venue.id === "uniswap_v3") {
        console.log(`[Launchpad] Initializing & Minting Uniswap V3 Pool...`);
        const posMgr = CANONICAL_BASE_CONTRACTS.UniswapV3PositionManager;
        const feeTier = 10000; // 1% for community tokens

        // 1. Wrap ETH to WETH
        const wrapAbi = parseAbi(["function deposit() payable"]);
        const wrapTx = await walletClient.writeContract({
          address: CANONICAL_BASE_CONTRACTS.WETH,
          abi: wrapAbi,
          functionName: "deposit",
          value: ethAmount,
          account: userAddress,
          chain: activeChain,
        });
        await confirm(wrapTx);

        // 3. Approve WETH & Token for Position Manager
        const approveToken = await walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [posMgr, tokenAmount],
          account: userAddress,
          chain: activeChain,
        });
        await confirm(approveToken);

        const approveWeth = await walletClient.writeContract({
          address: CANONICAL_BASE_CONTRACTS.WETH,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [posMgr, ethAmount],
          account: userAddress,
          chain: activeChain,
        });
        await confirm(approveWeth);

        // 4. Mint Full Range Position
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);
        const { request } = await publicClient.simulateContract({
          ...buildV3MintCall(
            CANONICAL_BASE_CONTRACTS.WETH,
            tokenAddress,
            ethAmount,
            tokenAmount,
            feeTier,
            recipient,
            deadline
          ),
          account: userAddress,
        });
        const mintTx = await walletClient.writeContract({ ...request, chain: activeChain });
        await confirm(mintTx);
        console.log(`[Launchpad] Uniswap V3 position minted successfully!`);
      } else {
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
        await confirm(approveHash);

        console.log(`[Launchpad] Adding initial liquidity to ${venue.name}...`);
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 mins
        const tokenMin = (tokenAmount * 95n) / 100n; // 5% slippage floor for initial seed
        const ethMin = (ethAmount * 95n) / 100n;
        const shared = {
          address: router,
          functionName: "addLiquidityETH",
          value: ethAmount,
          account: userAddress,
          chain: activeChain,
        } as const;
        // Aerodrome's router takes a stable flag; launched tokens go in its volatile pools.
        const liqHash =
          venue.id === "aerodrome"
            ? await walletClient.writeContract({
                ...shared,
                abi: AERODROME_ROUTER_ABI,
                args: [tokenAddress, false, tokenAmount, tokenMin, ethMin, recipient, deadline],
              })
            : await walletClient.writeContract({
                ...shared,
                abi: UNISWAP_V2_ROUTER_ABI,
                args: [tokenAddress, tokenAmount, tokenMin, ethMin, recipient, deadline],
              });
        await confirm(liqHash);
        console.log(`[Launchpad] Liquidity added successfully to ${venue.name}!`);
      }
    } catch (seedErr) {
      liquiditySeedingError =
        seedErr instanceof Error ? seedErr.message : "Liquidity seeding failed";
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
    liquiditySeedingError,
    txHash: tokenTxHash,
    deploymentMode: form.executionMode,
    archetype: form.selectedArchetype,
  };
}
