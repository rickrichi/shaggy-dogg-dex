// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IRewardUsdc {
    function decimals() external view returns (uint8);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Immutable weekly allocations funded atomically by the publishing owner.
/// @dev The owner attests to off-chain profit accounting. The contract enforces funding and claims,
/// not the economic truth of a ledger. No clawback, expiry, upgrade or administrator withdrawal.
contract WeeklyUsdcDistributor {
    struct Epoch {
        bytes32 root;
        bytes32 ledgerHash;
        uint256 allocated;
        uint256 claimed;
    }

    IRewardUsdc public immutable rewardToken;
    uint64 public immutable epochOrigin;
    uint256 public constant WEEK = 7 days;
    address public owner;
    address public pendingOwner;
    uint256 public lastPublishedEpoch;
    uint256 public totalReserved;
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public hasClaimed;
    uint256 private entered = 1;

    event EpochPublished(uint256 indexed epochId, bytes32 root, bytes32 ledgerHash, uint256 allocation);
    event Claimed(uint256 indexed epochId, address indexed account, uint256 amount);
    event OwnershipTransferStarted(address indexed owner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    modifier nonReentrant() {
        require(entered == 1, "Reentrant call");
        entered = 2;
        _;
        entered = 1;
    }

    constructor(address usdc, address initialOwner, uint64 origin) {
        require(usdc.code.length > 0 && initialOwner != address(0), "Invalid address");
        require(origin > 0, "Invalid origin");
        require(IRewardUsdc(usdc).decimals() == 6, "Expected 6 decimals");
        rewardToken = IRewardUsdc(usdc);
        owner = initialOwner;
        epochOrigin = origin;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    function transferOwnership(address nextOwner) external onlyOwner {
        require(nextOwner != address(0), "Invalid owner");
        pendingOwner = nextOwner;
        emit OwnershipTransferStarted(owner, nextOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        address previous = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(previous, msg.sender);
    }

    /// @notice Includes empty epochs (zero root and allocation) so periods cannot be skipped/reused.
    /// @param ledgerHash keccak256 of the exact published ledger bytes, for independent reconciliation.
    function publishEpoch(uint256 epochId, bytes32 root, bytes32 ledgerHash, uint256 allocation)
        external onlyOwner nonReentrant
    {
        require(epochId == lastPublishedEpoch + 1, "Epoch out of sequence");
        require(uint256(epochOrigin) + epochId * WEEK <= block.timestamp, "Epoch not ended");
        require(ledgerHash != bytes32(0), "Missing ledger hash");
        require((allocation == 0) == (root == bytes32(0)), "Invalid allocation root");
        uint256 beforeBalance = rewardToken.balanceOf(address(this));
        require(beforeBalance >= totalReserved, "Existing reserve shortfall");

        lastPublishedEpoch = epochId;
        epochs[epochId] = Epoch(root, ledgerHash, allocation, 0);
        totalReserved += allocation;
        if (allocation > 0) {
            _callToken(abi.encodeCall(IRewardUsdc.transferFrom, (msg.sender, address(this), allocation)));
            require(rewardToken.balanceOf(address(this)) == beforeBalance + allocation, "Funding mismatch");
        }
        emit EpochPublished(epochId, root, ledgerHash, allocation);
    }

    /// @notice Anyone may relay a valid claim; payment always goes to the proven account.
    function claim(uint256 epochId, address account, uint256 amount, bytes32[] calldata proof)
        external nonReentrant
    {
        require(account != address(0) && account != address(this) && amount > 0, "Invalid claim");
        Epoch storage epoch = epochs[epochId];
        require(epoch.root != bytes32(0), "Epoch not funded");
        require(!hasClaimed[epochId][account], "Already claimed");
        require(proof.length <= 64, "Proof too long");
        bytes32 computed = keccak256(bytes.concat(keccak256(abi.encode(
            block.chainid, address(this), epochId, account, amount
        ))));
        for (uint256 i; i < proof.length; ++i) {
            bytes32 sibling = proof[i];
            computed = computed < sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }
        require(computed == epoch.root, "Invalid proof");
        require(epoch.claimed + amount <= epoch.allocated, "Allocation exceeded");

        hasClaimed[epochId][account] = true;
        epoch.claimed += amount;
        totalReserved -= amount;
        uint256 beforeBalance = rewardToken.balanceOf(account);
        _callToken(abi.encodeCall(IRewardUsdc.transfer, (account, amount)));
        require(rewardToken.balanceOf(account) == beforeBalance + amount, "Payout mismatch");
        require(rewardToken.balanceOf(address(this)) >= totalReserved, "Reserve shortfall");
        emit Claimed(epochId, account, amount);
    }

    function _callToken(bytes memory data) private {
        (bool ok, bytes memory result) = address(rewardToken).call(data);
        require(ok && (result.length == 0 || (result.length == 32 && abi.decode(result, (bool)))), "Token transfer failed");
    }
}
