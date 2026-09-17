// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./GovernanceToken.sol";

/**
 * @title FeeDiscountStaking
 * @notice Stake GovernanceToken to receive fee discount tiers
 */
contract FeeDiscountStaking {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // --- Structs ---
    struct Tier {
        uint256 stakeRequired; // tokens required
        uint16 discountBps;    // discount in basis points (100 = 1%)
    }

    // --- State ---
    GovernanceToken public immutable token;

    address public admin;
    address public tierAdmin;

    uint256 public minimumStakePeriod;
    uint16 public withdrawalFeeBps;

    mapping(address => uint256) public stakedBalance;
    mapping(address => uint256) public stakeTimestamp;

    Tier[] public tiers;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    // --- Events ---
    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount, uint256 fee);
    event TiersUpdated();
    event WithdrawalFeeUpdated(uint16 feeBps);
    event MinimumStakePeriodUpdated(uint256 period);
    event AdminChanged(address newAdmin);
    event TierAdminChanged(address newTierAdmin);

    constructor(
        address tokenAddress,
        address _admin,
        address _tierAdmin
    ) {
        require(tokenAddress != address(0), "Invalid token");
        require(_admin != address(0), "Invalid admin");
        require(_tierAdmin != address(0), "Invalid tier admin");

        token = GovernanceToken(tokenAddress);

        admin = _admin;
        tierAdmin = _tierAdmin;
    }

    // --- Admin Controls ---

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyTierAdmin() {
        require(msg.sender == tierAdmin, "Not tierAdmin");
        _;
    }

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "Reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    function setTiers(Tier[] memory newTiers) external onlyTierAdmin {
        delete tiers;
        for (uint256 i = 0; i < newTiers.length; i++) {
            tiers.push(newTiers[i]);
        }
        emit TiersUpdated();
    }

    function setWithdrawalFee(uint16 feeBps) external onlyAdmin {
        require(feeBps <= 5000, "Too high"); // max 50%
        withdrawalFeeBps = feeBps;
        emit WithdrawalFeeUpdated(feeBps);
    }

    function setMinimumStakePeriod(uint256 period) external onlyAdmin {
        minimumStakePeriod = period;
        emit MinimumStakePeriodUpdated(period);
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    function setTierAdmin(address newTierAdmin) external onlyAdmin {
        require(newTierAdmin != address(0), "Invalid");
        tierAdmin = newTierAdmin;
        emit TierAdminChanged(newTierAdmin);
    }

    // --- Staking Logic ---

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");

        // Effects and their audit log are applied before the token interaction;
        // any failed transfer reverts the entire transaction atomically.
        // forge-lint: disable-next-line(missing-events-access-control)
        stakedBalance[msg.sender] += amount;
        // forge-lint: disable-next-line(missing-events-access-control)
        stakeTimestamp[msg.sender] = block.timestamp;
        emit Staked(msg.sender, amount);

        // Guarded by nonReentrant; the linter does not model modifier state.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        require(token.transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero amount");
        require(stakedBalance[msg.sender] >= amount, "Insufficient stake");

        // A timestamp is the intended clock for a multi-day stake lock. Miner
        // drift is negligible relative to the configured seven-day period.
        require(
            // forge-lint: disable-next-line(block-timestamp)
            block.timestamp >= stakeTimestamp[msg.sender] + minimumStakePeriod,
            "Stake locked"
        );

        // forge-lint: disable-next-line(missing-events-access-control)
        stakedBalance[msg.sender] -= amount;

        uint256 fee = (amount * withdrawalFeeBps) / 10_000;
        uint256 payout = amount - fee;

        emit Unstaked(msg.sender, amount, fee);

        // Guarded by nonReentrant; the linter does not model modifier state.
        // forge-lint: disable-next-line(reentrancy-no-eth)
        require(token.transfer(msg.sender, payout), "Transfer failed");
    }

    // --- Views ---

    function getTier(address user) external view returns (uint16) {
        uint256 stakeAmount = stakedBalance[user];

        uint16 best = 0;
        for (uint256 i = 0; i < tiers.length; i++) {
            if (stakeAmount >= tiers[i].stakeRequired) {
                best = tiers[i].discountBps;
            }
        }
        return best;
    }

    function tiersLength() external view returns (uint256) {
        return tiers.length;
    }
}
