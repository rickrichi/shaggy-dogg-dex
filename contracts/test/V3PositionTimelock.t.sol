// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/V3PositionTimelock.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes calldata) external;
}

contract MockPositionManager is INonfungiblePositionManager {
    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public operators;

    uint256 public feesCollected0 = 500 ether;
    uint256 public feesCollected1 = 1 ether;

    function mint(address to, uint256 tokenId) external {
        owners[tokenId] = to;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return owners[tokenId];
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(owners[tokenId] == from || operators[tokenId] == msg.sender, "Not authorized");
        owners[tokenId] = to;

        // Call onERC721Received if receiver is contract
        if (to.code.length > 0) {
            bytes4 retval = IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, "");
            require(retval == IERC721Receiver.onERC721Received.selector, "Transfer rejected");
        }
    }

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1) {
        require(owners[params.tokenId] == msg.sender, "Caller must own NFT");
        return (feesCollected0, feesCollected1);
    }

    function positions(uint256)
        external
        pure
        returns (
            uint96,
            address,
            address,
            address,
            uint24,
            int24,
            int24,
            uint128,
            uint256,
            uint256,
            uint128,
            uint128
        )
    {
        return (0, address(0), address(0), address(0), 10000, -887220, 887220, 1000000, 0, 0, 0, 0);
    }
}

contract V3PositionTimelockTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    V3PositionTimelock public timelock;
    MockPositionManager public mockManager;

    address public alice = address(0xAAAA);
    address public bob = address(0xBBBB);
    uint256 public constant TOKEN_ID = 6245990;

    function setUp() public {
        mockManager = new MockPositionManager();
        timelock = new V3PositionTimelock(address(mockManager));

        // Mint NFT to Alice
        mockManager.mint(alice, TOKEN_ID);
    }

    function test_LockPosition() public {
        uint256 unlockTime = block.timestamp + 365 days;

        vm.prank(alice);
        timelock.lockPosition(TOKEN_ID, unlockTime);

        (address owner, uint256 unlock, uint256 lockedAt, bool active) = timelock.getLock(TOKEN_ID);
        require(owner == alice, "Owner mismatch");
        require(unlock == unlockTime, "Unlock time mismatch");
        require(lockedAt == block.timestamp, "LockedAt mismatch");
        require(active, "Should be active");
        require(mockManager.ownerOf(TOKEN_ID) == address(timelock), "Manager owner mismatch");
    }

    function test_CannotWithdrawBeforeUnlock() public {
        uint256 unlockTime = block.timestamp + 365 days;

        vm.prank(alice);
        timelock.lockPosition(TOKEN_ID, unlockTime);

        // Advance 100 days
        vm.warp(block.timestamp + 100 days);

        vm.prank(alice);
        vm.expectRevert("Timelock still active");
        timelock.withdraw(TOKEN_ID);
    }

    function test_NonOwnerCannotWithdraw() public {
        uint256 unlockTime = block.timestamp + 365 days;

        vm.prank(alice);
        timelock.lockPosition(TOKEN_ID, unlockTime);

        vm.warp(unlockTime + 1);

        vm.prank(bob);
        vm.expectRevert("Only lock owner");
        timelock.withdraw(TOKEN_ID);
    }

    function test_HarvestTradingFees() public {
        uint256 unlockTime = block.timestamp + 365 days;

        vm.prank(alice);
        timelock.lockPosition(TOKEN_ID, unlockTime);

        vm.prank(alice);
        (uint256 a0, uint256 a1) = timelock.harvestTradingFees(TOKEN_ID);
        require(a0 == 500 ether, "Fee0 mismatch");
        require(a1 == 1 ether, "Fee1 mismatch");

        // Bob cannot harvest Alice's fees
        vm.prank(bob);
        vm.expectRevert("Only lock owner can harvest fees");
        timelock.harvestTradingFees(TOKEN_ID);
    }

    function test_ExtendLock() public {
        uint256 unlockTime = block.timestamp + 90 days;

        vm.prank(alice);
        timelock.lockPosition(TOKEN_ID, unlockTime);

        uint256 newUnlock = block.timestamp + 365 days;
        vm.prank(alice);
        timelock.extendLock(TOKEN_ID, newUnlock);

        (, uint256 unlock,,) = timelock.getLock(TOKEN_ID);
        require(unlock == newUnlock, "New unlock mismatch");

        // Cannot shorten
        vm.prank(alice);
        vm.expectRevert("Must exceed current unlock");
        timelock.extendLock(TOKEN_ID, newUnlock - 10 days);
    }

    function test_WithdrawAfterUnlock() public {
        uint256 unlockTime = block.timestamp + 365 days;

        vm.prank(alice);
        timelock.lockPosition(TOKEN_ID, unlockTime);

        // Advance past unlock
        vm.warp(unlockTime + 1);

        vm.prank(alice);
        timelock.withdraw(TOKEN_ID);

        require(mockManager.ownerOf(TOKEN_ID) == alice, "NFT should be returned to Alice");
        require(!timelock.isLocked(TOKEN_ID), "Should no longer be locked");
    }
}
