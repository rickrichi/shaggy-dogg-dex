// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {PackedUserOperation, IEntryPoint, IPaymaster} from "@openzeppelin/contracts/interfaces/IERC4337.sol";
import {ERC4337Utils} from "@openzeppelin/contracts/account/utils/ERC4337Utils.sol";
import {Paymaster} from "@openzeppelin/contracts/account/paymaster/Paymaster.sol";

/**
 * @notice Sponsors approved ERC-4337 v0.8 operations and rewards successful accounts.
 * @dev The signer authorizes the exact account call, nonce, gas limits and short expiry. The signer
 * must apply an off-chain eligibility and rate-limit policy; this contract also caps ETH exposure
 * per operation. No portfolio token is collected from users. Rewards are reserved during validation and
 * released in postOp, preventing two operations in a bundle from promising the same tokens.
 */
contract SponsoredRewardPaymaster is Paymaster, Ownable2Step, Pausable {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_SIGNATURE_AGE = 10 minutes;
    uint32 public constant MAX_COOLDOWN = 7 days;
    address public constant ACCOUNT_IMPLEMENTATION = 0xe6Cae83BdE06E4c305530e199D7217f42808555B;
    bytes32 public constant ACCOUNT_DESIGNATOR_HASH =
        keccak256(abi.encodePacked(hex"ef0100", ACCOUNT_IMPLEMENTATION));
    bytes32 public constant SPONSORSHIP_TYPEHASH = keccak256(
        "Sponsorship(address paymaster,uint256 chainId,address sender,uint256 nonce,bytes32 initCodeHash,bytes32 callDataHash,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,uint128 paymasterVerificationGasLimit,uint128 paymasterPostOpGasLimit,uint48 validUntil,uint256 rewardAmount)"
    );

    IERC20 public immutable rewardToken;
    address public sponsorSigner;
    uint256 public rewardAmount;
    uint256 public maxCostPerOp;
    uint256 public reservedRewards;
    uint32 public cooldownSeconds = 1 days;
    mapping(address => uint256) public lastSponsoredAt;

    event SponsorSignerUpdated(address indexed signer);
    event RewardAmountUpdated(uint256 amount);
    event MaxCostPerOpUpdated(uint256 amount);
    event CooldownUpdated(uint32 seconds_);
    event RewardPaid(bytes32 indexed userOpHash, address indexed smartAccount, uint256 amount);

    error InvalidAddress();
    error InvalidAmount();
    error InsufficientUnreservedRewards();
    error OwnershipCannotBeRenounced();
    error InvalidCooldown();

    constructor(IERC20 rewardToken_, address owner_, address signer_, uint256 reward_, uint256 maxCost_)
        Ownable(owner_)
    {
        if (address(rewardToken_) == address(0)) revert InvalidAddress();
        rewardToken = rewardToken_;
        _setSigner(signer_);
        _setReward(reward_);
        _setMaxCost(maxCost_);
    }

    function entryPoint() public pure override returns (IEntryPoint) {
        return ERC4337Utils.ENTRYPOINT_V08;
    }

    function setSponsorSigner(address signer_) external onlyOwner {
        _setSigner(signer_);
    }

    function setRewardAmount(uint256 reward_) external onlyOwner {
        _setReward(reward_);
    }

    function setMaxCostPerOp(uint256 maxCost_) external onlyOwner {
        _setMaxCost(maxCost_);
    }

    function setCooldown(uint32 seconds_) external onlyOwner {
        if (seconds_ > MAX_COOLDOWN) revert InvalidCooldown();
        cooldownSeconds = seconds_;
        emit CooldownUpdated(seconds_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function deposit() external payable {
        _deposit(msg.value);
    }

    function withdrawDeposit(address payable recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        _withdraw(recipient, amount);
    }

    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        _addStake(msg.value, unstakeDelaySec);
    }

    function unlockStake() external onlyOwner {
        _unlockStake();
    }

    function withdrawStake(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        _withdrawStake(recipient);
    }

    function withdrawRewards(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount > availableRewards()) revert InsufficientUnreservedRewards();
        rewardToken.safeTransfer(recipient, amount);
    }

    function renounceOwnership() public pure override {
        revert OwnershipCannotBeRenounced();
    }

    function availableRewards() public view returns (uint256) {
        uint256 balance = rewardToken.balanceOf(address(this));
        return balance > reservedRewards ? balance - reservedRewards : 0;
    }

    /**
     * @notice Returns the raw 32-byte message the sponsor signs with personal_sign/signMessage.
     * @dev The paymasterAndData field is deliberately excluded from the hash to avoid signing its
     * own signature. The caller must supply the final gas fields and a 52-byte v0.8 paymaster header.
     */
    function sponsorshipMessage(PackedUserOperation calldata userOp, uint48 validUntil)
        public
        view
        returns (bytes32)
    {
        bytes calldata data = userOp.paymasterAndData;
        require(data.length >= 52 && address(bytes20(data[0:20])) == address(this), "Bad paymaster header");
        return keccak256(
            abi.encode(
                SPONSORSHIP_TYPEHASH,
                address(this),
                block.chainid,
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.accountGasLimits,
                userOp.preVerificationGas,
                userOp.gasFees,
                uint128(bytes16(data[20:36])),
                uint128(bytes16(data[36:52])),
                validUntil,
                rewardAmount
            )
        );
    }

    function _validatePaymasterUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
        internal
        override
        returns (bytes memory context, uint256 validationData)
    {
        bytes calldata data = userOp.paymasterAndData;
        if (paused() || data.length != 52 + 6 + 65 || maxCost > maxCostPerOp ||
            userOp.sender.codehash != ACCOUNT_DESIGNATOR_HASH) {
            return ("", ERC4337Utils.SIG_VALIDATION_FAILED);
        }
        if (lastSponsoredAt[userOp.sender] != 0 &&
            block.timestamp < lastSponsoredAt[userOp.sender] + cooldownSeconds) {
            return ("", ERC4337Utils.SIG_VALIDATION_FAILED);
        }
        uint48 validUntil = uint48(bytes6(data[52:58]));
        if (validUntil < block.timestamp || validUntil > block.timestamp + MAX_SIGNATURE_AGE) {
            return ("", ERC4337Utils.SIG_VALIDATION_FAILED);
        }
        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(sponsorshipMessage(userOp, validUntil));
        (address recovered, ECDSA.RecoverError error,) = ECDSA.tryRecover(digest, data[58:]);
        if (error != ECDSA.RecoverError.NoError || recovered != sponsorSigner) {
            return ("", ERC4337Utils.SIG_VALIDATION_FAILED);
        }
        if (availableRewards() < rewardAmount) {
            return ("", ERC4337Utils.SIG_VALIDATION_FAILED);
        }
        reservedRewards += rewardAmount;
        lastSponsoredAt[userOp.sender] = block.timestamp;
        return (abi.encode(userOpHash, userOp.sender, rewardAmount), uint256(validUntil) << 160);
    }

    function _postOp(IPaymaster.PostOpMode mode, bytes calldata context, uint256, uint256)
        internal
        override
    {
        (bytes32 userOpHash, address smartAccount, uint256 amount) =
            abi.decode(context, (bytes32, address, uint256));
        reservedRewards -= amount;
        if (mode == IPaymaster.PostOpMode.opSucceeded) {
            rewardToken.safeTransfer(smartAccount, amount);
            emit RewardPaid(userOpHash, smartAccount, amount);
        }
    }

    function _setSigner(address signer_) internal {
        if (signer_ == address(0)) revert InvalidAddress();
        sponsorSigner = signer_;
        emit SponsorSignerUpdated(signer_);
    }

    function _setReward(uint256 reward_) internal {
        if (reward_ == 0) revert InvalidAmount();
        rewardAmount = reward_;
        emit RewardAmountUpdated(reward_);
    }

    function _setMaxCost(uint256 maxCost_) internal {
        if (maxCost_ == 0) revert InvalidAmount();
        maxCostPerOp = maxCost_;
        emit MaxCostPerOpUpdated(maxCost_);
    }
}
