// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./GovernanceToken.sol";
import "./FeeDiscountStaking.sol";
import "./AaveFlashBorrower.sol";
import "./YieldStakingVault.sol";
import "./CompoundYieldVault.sol";

/**
 * @title DeployEcosystem
 * @notice Master deployment contract for the full Shaggy-Dogg-DEX DeFi ecosystem.
 * Deploys GovernanceToken, FeeDiscountStaking, AaveFlashBorrower, YieldStakingVault,
 * and CompoundYieldVault atomically in a single transaction.
 */
contract DeployEcosystem {
    string constant TOKEN_NAME = "Shaggy Dogg";
    string constant TOKEN_SYMBOL = "SD";
    uint256 constant INITIAL_MINT = 1_000_000 * 10**18;

    uint256 constant MINIMUM_STAKE_PERIOD = 7 days;
    uint16 constant WITHDRAWAL_FEE_BPS = 100;

    // Official Base L2 Aave v3 Pool (Mainnet: 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5)
    address public immutable aavePoolAddress;

    GovernanceToken public token;
    FeeDiscountStaking public staking;
    AaveFlashBorrower public flashBorrower;
    YieldStakingVault public aaveVault;
    CompoundYieldVault public compoundVault;

    bool public isDeployed;

    event EcosystemDeployed(
        address indexed token,
        address indexed staking,
        address flashBorrower,
        address aaveVault,
        address compoundVault
    );

    constructor(address _aavePool) {
        aavePoolAddress = _aavePool != address(0)
            ? _aavePool
            : 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    }

    function run(address underlyingAsset, address cometAddress)
        external
        returns (
            GovernanceToken,
            FeeDiscountStaking,
            AaveFlashBorrower,
            YieldStakingVault,
            CompoundYieldVault
        )
    {
        require(!isDeployed, "Already deployed");
        isDeployed = true;

        address deployer = msg.sender;

        // 1. Deploy GovernanceToken
        token = new GovernanceToken(
            TOKEN_NAME,
            TOKEN_SYMBOL,
            deployer,
            deployer,
            INITIAL_MINT
        );

        // 2. Deploy FeeDiscountStaking
        staking = new FeeDiscountStaking(
            address(token),
            address(this),
            address(this)
        );

        // Configure Staking Tiers
        FeeDiscountStaking.Tier[] memory tiers = new FeeDiscountStaking.Tier[](4);
        tiers[0] = FeeDiscountStaking.Tier(1_000 * 10**18, 100);
        tiers[1] = FeeDiscountStaking.Tier(10_000 * 10**18, 250);
        tiers[2] = FeeDiscountStaking.Tier(100_000 * 10**18, 500);
        tiers[3] = FeeDiscountStaking.Tier(1_000_000 * 10**18, 1000);

        staking.setTiers(tiers);
        staking.setWithdrawalFee(WITHDRAWAL_FEE_BPS);
        staking.setMinimumStakePeriod(MINIMUM_STAKE_PERIOD);
        staking.setTierAdmin(deployer);
        staking.setAdmin(deployer);

        // 3. Deploy AaveFlashBorrower
        flashBorrower = new AaveFlashBorrower(aavePoolAddress, deployer);

        // 4. Deploy Aave YieldStakingVault
        if (underlyingAsset != address(0)) {
            aaveVault = new YieldStakingVault(
                underlyingAsset,
                aavePoolAddress,
                address(0),
                address(staking),
                deployer,
                deployer
            );

            // 5. Deploy CompoundYieldVault
            compoundVault = new CompoundYieldVault(
                underlyingAsset,
                cometAddress,
                address(staking),
                deployer,
                deployer
            );
        }

        emit EcosystemDeployed(
            address(token),
            address(staking),
            address(flashBorrower),
            address(aaveVault),
            address(compoundVault)
        );

        return (token, staking, flashBorrower, aaveVault, compoundVault);
    }
}
