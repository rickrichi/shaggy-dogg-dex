// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title FeeDiscountStaking
 * @notice Users stake SDT to earn fee discounts (in basis points).
 * Admin (timelock) controls tier thresholds & discount BPS.
 * @dev Uses SafeERC20 and AccessControl. Not a rewards contract—purely discount gating.
 * Enhanced with pause functionality, minimum stake periods, and improved tier validation.
 */
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

contract FeeDiscountStaking is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    /*
     * Type Declarations
     */
    struct Tier {
        uint256 minStake;      // inclusive threshold in token units (18 decimals typical)
        uint16 discountBps;    // 0..10000
    }

    /*
     * Constants
     */
    uint16 public constant MAX_BPS = 10_000;             // 100%
    uint16 public constant MAX_WITHDRAWAL_FEE_BPS = 500; // 5% max withdrawal fee

    /*
     * State Variables
     */
    // Immutable
    IERC20 public immutable token;

    // Storage
    mapping(address => uint256) private _staked;        // user => amount
    mapping(address => uint256) private _lastDepositTime; // user => timestamp
    uint256 public totalStaked;
    Tier[] private _tiers;                             // ascending by minStake
    uint256 public minimumStakePeriod = 1 days;       // Minimum time before withdrawal
    uint16 public withdrawalFeeBps;                   // Fee charged on withdrawals
    bool public emergencyMode;                        // Emergency mode flag

    /*
     * Roles
     */
    bytes32 public constant TIER_ADMIN_ROLE = keccak256("TIER_ADMIN_ROLE");
    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN_ROLE");

    /*
     * Errors
     */
    error ErrZeroAddress();
    error ErrAmountZero();
    error ErrInsufficientStake();
    error ErrInvalidTiers();
    error ErrTooManyTiers();
    error ErrMinimumStakePeriodNotMet();
    error ErrInvalidWithdrawalFee();
    error ErrEmergencyWithdrawalExceedsAvailable();
    error ErrEmergencyNotActive();

    /*
     * Events
     */
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount, uint256 amountAfterFee);
    event TiersUpdated(Tier[] tiers);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event MinimumStakePeriodUpdated(uint256 period);
    event WithdrawalFeeUpdated(uint16 feeBps);
    event EmergencyModeActivated(bool active);

    /*
     * Constructor
     */
    constructor(address token_, address admin_, address tierAdmin_) {
        if (token_ == address(0) || admin_ == address(0) || tierAdmin_ == address(0)) revert ErrZeroAddress();
        token = IERC20(token_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(TIER_ADMIN_ROLE, tierAdmin_);
        _grantRole(EMERGENCY_ADMIN_ROLE, admin_);
    }

    /*
     * View Functions
     */
    function stakedOf(address account) external view returns (uint256) {
        return _staked[account];
    }

    function lastDepositTimeOf(address account) external view returns (uint256) {
        return _lastDepositTime[account];
    }

    /**
     * @notice Calculates the fee discount in basis points for a given account.
     * @dev Uses a binary search algorithm for an efficient lookup, with a complexity of O(log n).
     */
    function discountBpsOf(address account) public view returns (uint16) {
        uint256 bal = _staked[account];
        uint256 n = _tiers.length;
        if (n == 0) return 0;

        uint256 low = 0;
        uint256 high = n - 1;
        uint16 bestDiscount = 0;

        while (low <= high) {
            uint256 mid = low + (high - low) / 2;
            if (bal >= _tiers[mid].minStake) {
                bestDiscount = _tiers[mid].discountBps;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return bestDiscount;
    }

    function getTiers() external view returns (Tier[] memory tiers) {
        tiers = _tiers;
    }

    function getExcessTokens() public view returns (uint256) {
        uint256 contractBalance = token.balanceOf(address(this));
        return contractBalance > totalStaked ? contractBalance - totalStaked : 0;
    }

    /*
     * Admin Functions
     */
    /**
     * @notice Sets full tier schedule. Must be ascending by minStake, discountBps <= MAX_BPS.
     * @dev Keep the array modest (< ~32) to avoid heavy gas reads.
     */
    function setTiers(Tier[] calldata tiers) external onlyRole(TIER_ADMIN_ROLE) {
        if (tiers.length > 128) revert ErrTooManyTiers();
        
        // Validate ascending order, bps range, and monotonically increasing discounts
        uint256 lastMinStake = 0;
        uint16 lastDiscount = 0;
        for (uint256 i = 0; i < tiers.length; i++) {
            if (i == 0 && tiers[i].minStake == 0) revert ErrInvalidTiers();
            if (i > 0 && tiers[i].minStake <= lastMinStake) revert ErrInvalidTiers();
            if (tiers[i].discountBps > MAX_BPS) revert ErrInvalidTiers();
            if (i > 0 && tiers[i].discountBps < lastDiscount) revert ErrInvalidTiers();
            lastMinStake = tiers[i].minStake;
            lastDiscount = tiers[i].discountBps;
        }

        delete _tiers;
        for (uint256 i = 0; i < tiers.length; i++) {
            _tiers.push(Tier({minStake: tiers[i].minStake, discountBps: tiers[i].discountBps}));
        }
        emit TiersUpdated(_tiers);
    }

    /**
     * @notice Sets the minimum period users must wait before withdrawing after deposit
     * @param period Time in seconds
     */
    function setMinimumStakePeriod(uint256 period) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minimumStakePeriod = period;
        emit MinimumStakePeriodUpdated(period);
    }

    /**
     * @notice Sets the withdrawal fee in basis points
     * @param feeBps Fee in basis points (max 500 = 5%)
     */
    function setWithdrawalFee(uint16 feeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (feeBps > MAX_WITHDRAWAL_FEE_BPS) revert ErrInvalidWithdrawalFee();
        withdrawalFeeBps = feeBps;
        emit WithdrawalFeeUpdated(feeBps);
    }

    /**
     * @notice Pauses deposits and withdrawals
     */
    function pause() external onlyRole(EMERGENCY_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpauses deposits and withdrawals
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Sets emergency mode which enables emergency withdrawals
     */
    function setEmergencyMode(bool active) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        emergencyMode = active;
        emit EmergencyModeActivated(active);
    }

    /*
     * User Actions
     */
    /**
     * @notice Deposits tokens for staking
     * @param amount Amount to stake
     */
    function deposit(uint256 amount) public nonReentrant whenNotPaused {
        if (amount == 0) revert ErrAmountZero();
        _staked[msg.sender] += amount;
        totalStaked += amount;
        _lastDepositTime[msg.sender] = block.timestamp;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Permit + deposit in one tx (gasless approval).
     * @param amount the stake amount
     * @param deadline permit deadline
     * @param v r s ECDSA signature
     */
    function depositWithPermit(
        uint256 amount,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external whenNotPaused {
        IERC20Permit(address(token)).permit(msg.sender, address(this), amount, deadline, v, r, s);
        deposit(amount);
    }

    /**
     * @notice Withdraws staked tokens, applying minimum stake period and withdrawal fee
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ErrAmountZero();
        uint256 bal = _staked[msg.sender];
        if (bal < amount) revert ErrInsufficientStake();

        // Check minimum stake period
        if (block.timestamp < _lastDepositTime[msg.sender] + minimumStakePeriod) revert ErrMinimumStakePeriodNotMet();

        // Calculate fee if applicable
        uint256 fee = amount * withdrawalFeeBps / MAX_BPS;
        uint256 amountAfterFee = amount - fee;

        unchecked {
            _staked[msg.sender] = bal - amount;
            totalStaked -= amount;
        }

        // Transfer tokens to user
        token.safeTransfer(msg.sender, amountAfterFee);

        emit Withdrawn(msg.sender, amount, amountAfterFee);
    }

    /*
     * Admin Escape Hatch
     */
    /**
     * @notice Emergency withdrawal function, limited to excess tokens when not in emergency mode
     * @param to Address to send tokens to
     * @param amount Amount to withdraw
     */
    function emergencyWithdraw(address to, uint256 amount) external onlyRole(EMERGENCY_ADMIN_ROLE) {
        if (to == address(0)) revert ErrZeroAddress();

        // In normal mode, only allow withdrawal of excess tokens
        if (!emergencyMode) {
            uint256 excessTokens = getExcessTokens();
            if (amount > excessTokens) revert ErrEmergencyWithdrawalExceedsAvailable();
        }

        token.safeTransfer(to, amount);
        emit EmergencyWithdraw(to, amount);
    }
}
