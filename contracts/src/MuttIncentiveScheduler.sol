// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice The parts of Uniswap's UniswapV3Staker this contract calls (Base deployment
///         0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1). Field types are ABI-identical to the
///         staker's IncentiveKey (IERC20Minimal and IUniswapV3Pool are addresses).
interface IUniswapV3StakerLike {
    struct IncentiveKey {
        address rewardToken;
        address pool;
        uint256 startTime;
        uint256 endTime;
        address refundee;
    }

    function maxIncentiveStartLeadTime() external view returns (uint256);
    function maxIncentiveDuration() external view returns (uint256);
    function createIncentive(IncentiveKey memory key, uint256 reward) external;
    function endIncentive(IncentiveKey memory key) external returns (uint256 refund);
    function unstakeToken(IncentiveKey memory key, uint256 tokenId) external;
}

/**
 * @title MuttIncentiveScheduler
 * @notice Holds the Mutt Rewards liquidity-rewards reserve and releases it only into the
 *         Uniswap V3 Staker incentives fixed at deployment (whitepaper v2.0 §14.3).
 *
 *         - The whole schedule (pool, every period's amount, start and end) is set in the
 *           constructor and can never change. Unclaimed rewards refund to 0x…dEaD.
 *         - No owner and no withdrawal function. MRWD leaves this contract only into a scheduled
 *           incentive or to 0x…dEaD.
 *         - Everything is permissionless: anyone can create a period's incentive inside its
 *           creation window, send a missed period's amount to 0x…dEaD, finalize a finished
 *           period, and, once every period is settled, send any leftover balance to 0x…dEaD.
 */
contract MuttIncentiveScheduler is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Period {
        uint128 amount;
        uint64 startTime;
        uint64 endTime;
    }

    enum Status {
        Pending,
        Created,
        Skipped
    }

    address public constant REFUNDEE = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant MAX_PERIODS = 48;

    IUniswapV3StakerLike public immutable staker;
    IERC20 public immutable rewardToken;
    address public immutable pool;
    /// @notice The staker's limits, read once at deployment; the schedule was checked against them.
    uint256 public immutable maxStartLeadTime;
    uint256 public immutable maxDuration;
    uint256 public immutable totalReserve;

    Period[] private _periods;
    Status[] private _status;

    event IncentiveCreated(uint256 indexed period, bytes32 incentiveId, uint256 amount);
    event PeriodSkipped(uint256 indexed period, uint256 amount);
    event PeriodFinalized(uint256 indexed period, uint256 refund);
    event LeftoverBurned(uint256 amount);

    error BadSchedule();
    error NotPending();
    error NotCreated();
    error WindowNotOpen();
    error WindowPassed();
    error NotMissed();
    error PeriodNotEnded();
    error Underfunded();
    error FundingMismatch();
    error PeriodsUnsettled();
    error NothingLeft();

    constructor(
        IUniswapV3StakerLike staker_,
        IERC20 rewardToken_,
        address pool_,
        Period[] memory schedule
    ) {
        if (address(staker_) == address(0) || address(rewardToken_) == address(0) || pool_ == address(0)) {
            revert BadSchedule();
        }
        uint256 n = schedule.length;
        if (n == 0 || n > MAX_PERIODS) revert BadSchedule();

        uint256 lead = staker_.maxIncentiveStartLeadTime();
        uint256 maxDur = staker_.maxIncentiveDuration();
        uint256 total;
        uint256 previousEnd = block.timestamp;
        for (uint256 i; i < n; i++) {
            Period memory p = schedule[i];
            // Periods are in order and never overlap (a period may start the moment the previous one
            // ends), none starts in the past, and each fits in one staker incentive.
            if (p.amount == 0 || p.startTime < previousEnd) revert BadSchedule();
            if (p.endTime <= p.startTime || p.endTime - p.startTime > maxDur) revert BadSchedule();
            previousEnd = p.endTime;
            total += p.amount;
            _periods.push(p);
            _status.push(Status.Pending);
        }

        staker = staker_;
        rewardToken = rewardToken_;
        pool = pool_;
        maxStartLeadTime = lead;
        maxDuration = maxDur;
        totalReserve = total;
    }

    // ── Views ────────────────────────────────────────────────────────────────

    function periodCount() external view returns (uint256) {
        return _periods.length;
    }

    function period(uint256 i) external view returns (Period memory p, Status status) {
        return (_periods[i], _status[i]);
    }

    function incentiveKey(uint256 i) public view returns (IUniswapV3StakerLike.IncentiveKey memory) {
        Period memory p = _periods[i];
        return IUniswapV3StakerLike.IncentiveKey({
            rewardToken: address(rewardToken),
            pool: pool,
            startTime: p.startTime,
            endTime: p.endTime,
            refundee: REFUNDEE
        });
    }

    /// @notice The staker's id for period `i`, keccak256(abi.encode(key)).
    function incentiveId(uint256 i) public view returns (bytes32) {
        return keccak256(abi.encode(incentiveKey(i)));
    }

    /// @notice When period `i`'s incentive can be created: [startTime - maxStartLeadTime, startTime].
    function creationWindow(uint256 i) public view returns (uint256 opens, uint256 closes) {
        uint256 start = _periods[i].startTime;
        opens = start > maxStartLeadTime ? start - maxStartLeadTime : 0;
        closes = start;
    }

    // ── Permissionless actions ───────────────────────────────────────────────

    /// @notice Create period `i`'s incentive on the staker, funded with exactly its amount.
    function createIncentive(uint256 i) external nonReentrant {
        if (_status[i] != Status.Pending) revert NotPending();
        (uint256 opens, uint256 closes) = creationWindow(i);
        if (block.timestamp < opens) revert WindowNotOpen();
        if (block.timestamp > closes) revert WindowPassed();
        uint256 amount = _periods[i].amount;
        uint256 before = rewardToken.balanceOf(address(this));
        if (before < amount) revert Underfunded();

        _status[i] = Status.Created;
        rewardToken.forceApprove(address(staker), amount);
        staker.createIncentive(incentiveKey(i), amount);
        // The staker pulled exactly this period's amount, and no allowance is left behind.
        if (before - rewardToken.balanceOf(address(this)) != amount) revert FundingMismatch();
        rewardToken.forceApprove(address(staker), 0);
        emit IncentiveCreated(i, incentiveId(i), amount);
    }

    /**
     * @notice If nobody created period `i` before it started, send its amount to 0x…dEaD so it is
     *         not stranded and cannot be redirected.
     */
    function skipMissedPeriod(uint256 i) external nonReentrant {
        if (_status[i] != Status.Pending) revert NotPending();
        if (block.timestamp <= _periods[i].startTime) revert NotMissed();
        uint256 amount = _periods[i].amount;
        if (rewardToken.balanceOf(address(this)) < amount) revert Underfunded();
        _status[i] = Status.Skipped;
        rewardToken.safeTransfer(REFUNDEE, amount);
        emit PeriodSkipped(i, amount);
    }

    /**
     * @notice After period `i` ends: unstake any positions still staked in its incentive (the
     *         staker lets anyone do this after the end time), then end the incentive so the
     *         unclaimed remainder goes to 0x…dEaD. Positions go back to their own owners' deposits.
     */
    function finalize(uint256 i, uint256[] calldata stakedTokenIds) external nonReentrant {
        if (_status[i] != Status.Created) revert NotCreated();
        if (block.timestamp < _periods[i].endTime) revert PeriodNotEnded();
        IUniswapV3StakerLike.IncentiveKey memory key = incentiveKey(i);
        for (uint256 t; t < stakedTokenIds.length; t++) {
            staker.unstakeToken(key, stakedTokenIds[t]);
        }
        uint256 refund = staker.endIncentive(key);
        emit PeriodFinalized(i, refund);
    }

    /// @notice Once every period is created or skipped, send whatever MRWD remains here to 0x…dEaD.
    function burnLeftover() external nonReentrant {
        for (uint256 i; i < _status.length; i++) {
            if (_status[i] == Status.Pending) revert PeriodsUnsettled();
        }
        uint256 left = rewardToken.balanceOf(address(this));
        if (left == 0) revert NothingLeft();
        rewardToken.safeTransfer(REFUNDEE, left);
        emit LeftoverBurned(left);
    }
}
