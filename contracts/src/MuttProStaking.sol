// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MuttProStaking
 * @notice Stake Mutt Rewards (MRWD) to qualify for Equilnyxs Pro (whitepaper v2.0 §11.1).
 *         The contract only records stakes. It pays no yield, charges no fee, has no owner, no
 *         pause, and no function that can send MRWD anywhere except back to the wallet that
 *         deposited it.
 *
 *         Every deposit has its own lock that ends LOCK_DURATION after it was made (or after it
 *         was last relocked). Matured deposits can be withdrawn at any time.
 *
 *         How the store uses it: to issue a Pro license that expires at time T, it checks that
 *         lockedUntil(wallet, T) is at least the stake it requires for Pro. That amount cannot be
 *         withdrawn before T, so a license never outlives the stake behind it. The required stake
 *         is the store's setting, not the contract's.
 */
contract MuttProStaking is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Deposit {
        uint128 amount;
        uint64 unlockAt;
    }

    /// @notice Most open deposits one wallet may hold, which bounds every loop below.
    uint256 public constant MAX_DEPOSITS = 32;
    uint256 public constant MIN_LOCK = 1 days;
    uint256 public constant MAX_LOCK = 365 days;

    IERC20 public immutable token;
    uint256 public immutable LOCK_DURATION;

    mapping(address => Deposit[]) private _deposits;
    mapping(address => uint256) public stakedOf;
    uint256 public totalStaked;

    event Staked(address indexed wallet, uint256 amount, uint256 unlockAt);
    event Relocked(address indexed wallet, uint256 amount, uint256 unlockAt);
    event Withdrawn(address indexed wallet, uint256 amount);

    error ZeroAmount();
    error TooManyDeposits();
    error NothingMatured();
    error BadLockDuration();
    error ZeroToken();
    error AmountTooLarge();

    constructor(IERC20 token_, uint256 lockDuration) {
        if (address(token_) == address(0)) revert ZeroToken();
        if (lockDuration < MIN_LOCK || lockDuration > MAX_LOCK) revert BadLockDuration();
        token = token_;
        LOCK_DURATION = lockDuration;
    }

    /// @notice Deposit `amount` MRWD, locked for LOCK_DURATION. Needs an allowance first.
    function stake(uint256 amount) external nonReentrant {
        _stake(msg.sender, amount);
    }

    /**
     * @notice Approve by EIP-2612 signature and deposit in one transaction. If the permit was
     *         already used (for example front-run by someone submitting the same signature), the
     *         deposit still goes ahead on the existing allowance.
     */
    function stakeWithPermit(uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
        nonReentrant
    {
        try IERC20Permit(address(token)).permit(msg.sender, address(this), amount, deadline, v, r, s) {
        } catch { }
        _stake(msg.sender, amount);
    }

    /// @notice Lock every deposit of the caller again for LOCK_DURATION from now, to keep Pro.
    function relockAll() external {
        Deposit[] storage list = _deposits[msg.sender];
        uint64 unlockAt = uint64(block.timestamp + LOCK_DURATION);
        uint256 amount;
        for (uint256 i; i < list.length; i++) {
            list[i].unlockAt = unlockAt;
            amount += list[i].amount;
        }
        if (amount == 0) revert ZeroAmount();
        emit Relocked(msg.sender, amount, unlockAt);
    }

    /// @notice Withdraw every matured deposit of the caller to the caller.
    function withdrawMatured() external nonReentrant returns (uint256 amount) {
        Deposit[] storage list = _deposits[msg.sender];
        uint256 i;
        while (i < list.length) {
            if (list[i].unlockAt <= block.timestamp) {
                amount += list[i].amount;
                list[i] = list[list.length - 1];
                list.pop();
            } else {
                i++;
            }
        }
        if (amount == 0) revert NothingMatured();
        stakedOf[msg.sender] -= amount;
        totalStaked -= amount;
        emit Withdrawn(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }

    /// @notice MRWD of `wallet` that cannot be withdrawn before `time`.
    function lockedUntil(address wallet, uint256 time) external view returns (uint256 amount) {
        Deposit[] storage list = _deposits[wallet];
        for (uint256 i; i < list.length; i++) {
            if (list[i].unlockAt >= time) amount += list[i].amount;
        }
    }

    /// @notice MRWD of `wallet` that can be withdrawn now.
    function maturedOf(address wallet) external view returns (uint256 amount) {
        Deposit[] storage list = _deposits[wallet];
        for (uint256 i; i < list.length; i++) {
            if (list[i].unlockAt <= block.timestamp) amount += list[i].amount;
        }
    }

    /// @notice The open deposits of `wallet`. Order changes when deposits are withdrawn.
    function depositsOf(address wallet) external view returns (Deposit[] memory) {
        return _deposits[wallet];
    }

    function _stake(address wallet, uint256 amount) private {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint128).max) revert AmountTooLarge();
        Deposit[] storage list = _deposits[wallet];
        if (list.length >= MAX_DEPOSITS) revert TooManyDeposits();
        uint64 unlockAt = uint64(block.timestamp + LOCK_DURATION);
        list.push(Deposit({ amount: uint128(amount), unlockAt: unlockAt }));
        stakedOf[wallet] += amount;
        totalStaked += amount;
        emit Staked(wallet, amount, unlockAt);
        token.safeTransferFrom(wallet, address(this), amount);
    }
}
