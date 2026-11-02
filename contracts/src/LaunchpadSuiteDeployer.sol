// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./AtomicFlashArbitrageRouter.sol";
import "./CompoundYieldVault.sol";
import "./FeeDiscountStaking.sol";
import "./YieldStakingVault.sol";

/**
 * @title LaunchpadSuiteDeployer
 * @notice Deployed once per launch. Its constructor creates and fully configures the staking and
 *         vault contracts in one transaction, so a launch cannot end half-configured. Any invalid
 *         setting reverts the whole transaction. It keeps no privileges afterwards: every contract
 *         it creates is handed to `admin` before the constructor returns.
 */
contract LaunchpadSuiteDeployer {
    address private constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address private constant BASE_AAVE_V3_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address private constant BASE_AUSDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;
    address private constant BASE_USDC_COMET = 0xb125E6687d4313864e53df431d5425969c15Eb2F;

    struct Config {
        address token;
        address admin;
        uint256 lockSeconds;
        uint16 unstakeFeeBps;
        uint16 performanceFeeBps;
        FeeDiscountStaking.Tier[] tiers;
        bool deployAaveVault;
        bool deployFullSuite;
        address usdc;
        address aavePool;
        address aUsdc;
        address comet;
    }

    address public immutable staking;
    address public immutable aaveVault;
    address public immutable compoundVault;
    address public immutable arbitrageRouter;

    constructor(Config memory config) {
        require(config.admin != address(0), "Invalid admin");

        FeeDiscountStaking newStaking = new FeeDiscountStaking(config.token, address(this), address(this));
        newStaking.setTiers(config.tiers);
        newStaking.setMinimumStakePeriod(config.lockSeconds);
        newStaking.setWithdrawalFee(config.unstakeFeeBps);
        newStaking.setTierAdmin(config.admin);
        newStaking.setAdmin(config.admin);
        staking = address(newStaking);

        address newAaveVault;
        address newCompoundVault;
        address newRouter;

        if (config.deployAaveVault || config.deployFullSuite) {
            require(config.usdc == BASE_USDC, "Non-canonical USDC");
            require(config.aavePool == BASE_AAVE_V3_POOL, "Non-canonical Aave pool");
            require(config.aUsdc == BASE_AUSDC, "Non-canonical aUSDC");
            YieldStakingVault vault = new YieldStakingVault(
                config.usdc,
                config.aavePool,
                config.aUsdc,
                address(newStaking),
                address(this),
                config.admin
            );
            vault.setPerformanceFee(config.performanceFeeBps);
            vault.setAdmin(config.admin);
            newAaveVault = address(vault);
        }

        if (config.deployFullSuite) {
            require(config.comet == BASE_USDC_COMET, "Non-canonical Comet");
            CompoundYieldVault vault = new CompoundYieldVault(
                config.usdc,
                config.comet,
                address(newStaking),
                address(this),
                config.admin
            );
            vault.setPerformanceFee(config.performanceFeeBps);
            vault.setAdmin(config.admin);
            newCompoundVault = address(vault);

            AtomicFlashArbitrageRouter router = new AtomicFlashArbitrageRouter(config.aavePool, address(this));
            router.setOperator(address(this), false);
            router.setAdmin(config.admin);
            newRouter = address(router);
        }

        aaveVault = newAaveVault;
        compoundVault = newCompoundVault;
        arbitrageRouter = newRouter;
    }
}
