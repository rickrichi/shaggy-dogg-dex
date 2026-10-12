// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC721Receiver {
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4);
}

interface INonfungiblePositionManager {
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function ownerOf(uint256 tokenId) external view returns (address);
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);
    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
}

/// @title V3PositionTimelock
/// @notice Non-custodial, sovereign timelock for Uniswap V3 Position NFTs.
/// @dev Allows locking an NFT position for a specified duration, harvesting 100% of accrued fees anytime,
/// and withdrawing the NFT once the unlock timestamp has passed.
contract V3PositionTimelock is IERC721Receiver {
    struct Lock {
        address owner;
        uint256 unlockTimestamp;
        uint256 lockedAt;
    }

    INonfungiblePositionManager public immutable positionManager;

    // tokenId => Lock details
    mapping(uint256 => Lock) public locks;

    event PositionLocked(uint256 indexed tokenId, address indexed owner, uint256 unlockTimestamp);
    event LockExtended(uint256 indexed tokenId, uint256 oldUnlockTimestamp, uint256 newUnlockTimestamp);
    event FeesHarvested(uint256 indexed tokenId, address indexed recipient, uint256 amount0, uint256 amount1);
    event PositionWithdrawn(uint256 indexed tokenId, address indexed owner);

    constructor(address _positionManager) {
        require(_positionManager != address(0), "Invalid position manager");
        positionManager = INonfungiblePositionManager(_positionManager);
    }

    /// @notice Lock an NFT position in the timelock contract
    /// @param tokenId The Uniswap V3 position NFT ID
    /// @param unlockTimestamp Unix timestamp after which withdrawal is permitted
    function lockPosition(uint256 tokenId, uint256 unlockTimestamp) external {
        require(unlockTimestamp > block.timestamp, "Unlock time must be in future");
        require(locks[tokenId].owner == address(0), "Position already locked");

        // Record lock before transfer
        locks[tokenId] = Lock({
            owner: msg.sender,
            unlockTimestamp: unlockTimestamp,
            lockedAt: block.timestamp
        });

        // Transfer NFT from sender into this contract
        positionManager.safeTransferFrom(msg.sender, address(this), tokenId);

        emit PositionLocked(tokenId, msg.sender, unlockTimestamp);
    }

    /// @notice Harvest 100% of accrued trading fees from Uniswap V3 without unlocking principal
    /// @param tokenId The Uniswap V3 position NFT ID
    function harvestTradingFees(uint256 tokenId) external returns (uint256 amount0, uint256 amount1) {
        Lock memory lock = locks[tokenId];
        require(lock.owner != address(0), "Position not locked");
        require(msg.sender == lock.owner, "Only lock owner can harvest fees");

        // Collect all accumulated fees directly to the owner's address
        (amount0, amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit FeesHarvested(tokenId, msg.sender, amount0, amount1);
    }

    /// @notice Extend the timelock duration (can only increase, never shorten)
    /// @param tokenId The Uniswap V3 position NFT ID
    /// @param newUnlockTimestamp The new Unix timestamp
    function extendLock(uint256 tokenId, uint256 newUnlockTimestamp) external {
        Lock storage lock = locks[tokenId];
        require(lock.owner != address(0), "Position not locked");
        require(msg.sender == lock.owner, "Only lock owner");
        require(newUnlockTimestamp > lock.unlockTimestamp, "Must exceed current unlock");

        uint256 oldUnlock = lock.unlockTimestamp;
        lock.unlockTimestamp = newUnlockTimestamp;

        emit LockExtended(tokenId, oldUnlock, newUnlockTimestamp);
    }

    /// @notice Withdraw the NFT position once unlock timestamp has elapsed
    /// @param tokenId The Uniswap V3 position NFT ID
    function withdraw(uint256 tokenId) external {
        Lock memory lock = locks[tokenId];
        require(lock.owner != address(0), "Position not locked");
        require(msg.sender == lock.owner, "Only lock owner");
        require(block.timestamp >= lock.unlockTimestamp, "Timelock still active");

        // Delete lock record before transfer to prevent re-entrancy
        delete locks[tokenId];

        positionManager.safeTransferFrom(address(this), msg.sender, tokenId);

        emit PositionWithdrawn(tokenId, msg.sender);
    }

    /// @notice View lock details for a position NFT
    function getLock(uint256 tokenId)
        external
        view
        returns (
            address owner,
            uint256 unlockTimestamp,
            uint256 lockedAt,
            bool isLockedActive
        )
    {
        Lock memory lock = locks[tokenId];
        bool active = lock.owner != address(0) && block.timestamp < lock.unlockTimestamp;
        return (lock.owner, lock.unlockTimestamp, lock.lockedAt, active);
    }

    /// @notice Check if a position is currently locked
    function isLocked(uint256 tokenId) external view returns (bool) {
        return locks[tokenId].owner != address(0) && block.timestamp < locks[tokenId].unlockTimestamp;
    }

    /// @notice ERC721 receiver implementation
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        require(msg.sender == address(positionManager), "Only Uniswap V3 Position Manager accepted");
        return this.onERC721Received.selector;
    }
}
