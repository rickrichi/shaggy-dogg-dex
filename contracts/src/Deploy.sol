// SPDX-License-Identifier: MIT
  pragma solidity 0.8.28;

  import "./GovernanceToken.sol";
  import "./FeeDiscountStaking.sol";

  /**
   * @title Deploy
   * @notice Deployment contract for Remix IDE
   */
  contract Deploy {
      // Token configuration
      string constant TOKEN_NAME = "Shaggy Dogg";
      string constant TOKEN_SYMBOL = "SD";
      uint256 constant INITIAL_MINT = 1_000_000 * 10**18;

      // Staking configuration
      uint256 constant MINIMUM_STAKE_PERIOD = 7 days;
      uint16 constant WITHDRAWAL_FEE_BPS = 100;

      // Store deployed addresses
      GovernanceToken public token;
      FeeDiscountStaking public staking;
      bool public isDeployed;

      event Deployed(address token, address staking);

      function run() external returns (GovernanceToken, FeeDiscountStaking) {
          require(!isDeployed, "Already deployed");

          address deployer = msg.sender;

          // 1 — Deploy GovernanceToken
          token = new GovernanceToken(
              TOKEN_NAME,
              TOKEN_SYMBOL,
              deployer, // admin
              deployer, // minter
              INITIAL_MINT
          );

          // 2 — Deploy FeeDiscountStaking
          staking = new FeeDiscountStaking(
              address(token),
              address(this), // temporary admin for atomic configuration
              address(this)  // temporary tierAdmin for atomic configuration
          );

          // 3 — Configure Staking
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

          isDeployed = true;
          emit Deployed(address(token), address(staking));

          return (token, staking);
      }

      // Helper to get deployment addresses
      function getAddresses() external view returns (address, address) {
          require(isDeployed, "Not deployed yet");
          return (address(token), address(staking));
      }
  }
