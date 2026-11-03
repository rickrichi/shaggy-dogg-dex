// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/V3PositionTimelock.sol";
import {FixedSupplyToken} from "../src/FixedSupplyToken.sol";
import {BaseForkSupport, ForkToken} from "./BaseForkSupport.sol";

interface RealPositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address);
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
    function ownerOf(uint256) external view returns (address);
    function approve(address, uint256) external;
}

interface SwapRouter02Like {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256);
}

/// V3PositionTimelock against Uniswap's real Base NonfungiblePositionManager, a real 1% pool (the
/// launchpad's fee tier) and real swaps that generate the trading fees it harvests. No mocks.
contract V3PositionTimelockTest is BaseForkSupport {
    address constant POSITIONS = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    uint24 constant FEE = 10_000;

    V3PositionTimelock public timelock;
    FixedSupplyToken public lnch;
    address public alice = address(0xAAAA);
    address public bob = address(0xBBBB);
    uint256 public tokenId;
    address token0;
    address token1;

    function setUp() public {
        _fork();
        timelock = new V3PositionTimelock(POSITIONS);
        lnch = new FixedSupplyToken("Lock Check", "LOCK", address(this), LAUNCH_SUPPLY);
        (token0, token1) = address(lnch) < WETH ? (address(lnch), WETH) : (WETH, address(lnch));
        RealPositionManager(POSITIONS).createAndInitializePoolIfNecessary(token0, token1, FEE, 2 ** 96);

        _wrapEth(12 ether);
        ForkToken(WETH).approve(POSITIONS, type(uint256).max);
        lnch.approve(POSITIONS, type(uint256).max);
        (tokenId,,,) = RealPositionManager(POSITIONS).mint(
            RealPositionManager.MintParams(
                token0, token1, FEE, -887200, 887200, 10 ether, 10 ether, 0, 0, alice, block.timestamp
            )
        );
        require(RealPositionManager(POSITIONS).ownerOf(tokenId) == alice, "real position minted to Alice");
    }

    function _lock(uint256 unlockTime) internal {
        vm.startPrank(alice);
        RealPositionManager(POSITIONS).approve(address(timelock), tokenId);
        timelock.lockPosition(tokenId, unlockTime);
        vm.stopPrank();
    }

    /// Real trades through the pool in both directions, so the position accrues fees in each token.
    function _trade() internal {
        ForkToken(WETH).approve(SWAP_ROUTER, type(uint256).max);
        lnch.approve(SWAP_ROUTER, type(uint256).max);
        SwapRouter02Like(SWAP_ROUTER).exactInputSingle(
            SwapRouter02Like.ExactInputSingleParams(WETH, address(lnch), FEE, address(this), 1 ether, 0, 0)
        );
        SwapRouter02Like(SWAP_ROUTER).exactInputSingle(
            SwapRouter02Like.ExactInputSingleParams(address(lnch), WETH, FEE, address(this), 1 ether, 0, 0)
        );
    }

    function test_LockPosition() public {
        uint256 unlockTime = block.timestamp + 365 days;
        _lock(unlockTime);

        (address owner, uint256 unlock, uint256 lockedAt, bool active) = timelock.getLock(tokenId);
        require(owner == alice, "Owner mismatch");
        require(unlock == unlockTime, "Unlock time mismatch");
        require(lockedAt == block.timestamp, "LockedAt mismatch");
        require(active, "Should be active");
        require(RealPositionManager(POSITIONS).ownerOf(tokenId) == address(timelock), "Manager owner mismatch");
    }

    function test_LockRequiresTheOwnersApprovalAndOwnership() public {
        vm.prank(alice);
        try timelock.lockPosition(tokenId, block.timestamp + 1 days) { revert("locked without approval"); } catch {}
        vm.prank(alice);
        RealPositionManager(POSITIONS).approve(address(timelock), tokenId);
        vm.prank(bob);
        try timelock.lockPosition(tokenId, block.timestamp + 1 days) { revert("bob locked Alice's NFT"); } catch {}
        require(!timelock.isLocked(tokenId), "nothing recorded");
        vm.prank(alice);
        vm.expectRevert(bytes("Unlock time must be in future"));
        timelock.lockPosition(tokenId, block.timestamp);
    }

    function test_OnlyThePositionManagerCanSendItNfts() public {
        vm.expectRevert(bytes("Only Uniswap V3 Position Manager accepted"));
        timelock.onERC721Received(address(this), alice, tokenId, "");
    }

    function test_CannotWithdrawBeforeUnlock() public {
        uint256 unlockTime = block.timestamp + 365 days;
        _lock(unlockTime);
        vm.warp(block.timestamp + 100 days);

        vm.prank(alice);
        vm.expectRevert(bytes("Timelock still active"));
        timelock.withdraw(tokenId);
    }

    function test_NonOwnerCannotWithdraw() public {
        uint256 unlockTime = block.timestamp + 365 days;
        _lock(unlockTime);
        vm.warp(unlockTime + 1);

        vm.prank(bob);
        vm.expectRevert(bytes("Only lock owner"));
        timelock.withdraw(tokenId);
    }

    function test_HarvestRealTradingFeesWhileLocked() public {
        _lock(block.timestamp + 365 days);
        _trade();

        uint256 alice0 = ForkToken(token0).balanceOf(alice);
        uint256 alice1 = ForkToken(token1).balanceOf(alice);
        vm.prank(alice);
        (uint256 a0, uint256 a1) = timelock.harvestTradingFees(tokenId);
        require(a0 > 0 && a1 > 0, "fees earned in both tokens");
        require(ForkToken(token0).balanceOf(alice) - alice0 == a0, "token0 fees paid to Alice");
        require(ForkToken(token1).balanceOf(alice) - alice1 == a1, "token1 fees paid to Alice");
        require(RealPositionManager(POSITIONS).ownerOf(tokenId) == address(timelock), "principal stays locked");

        // Bob cannot harvest Alice's fees
        vm.prank(bob);
        vm.expectRevert(bytes("Only lock owner can harvest fees"));
        timelock.harvestTradingFees(tokenId);
    }

    function test_ExtendLock() public {
        _lock(block.timestamp + 90 days);

        uint256 newUnlock = block.timestamp + 365 days;
        vm.prank(alice);
        timelock.extendLock(tokenId, newUnlock);

        (, uint256 unlock,,) = timelock.getLock(tokenId);
        require(unlock == newUnlock, "New unlock mismatch");

        // Cannot shorten
        vm.prank(alice);
        vm.expectRevert(bytes("Must exceed current unlock"));
        timelock.extendLock(tokenId, newUnlock - 10 days);
    }

    function test_WithdrawAfterUnlock() public {
        uint256 unlockTime = block.timestamp + 365 days;
        _lock(unlockTime);
        vm.warp(unlockTime + 1);

        vm.prank(alice);
        timelock.withdraw(tokenId);

        require(RealPositionManager(POSITIONS).ownerOf(tokenId) == alice, "NFT should be returned to Alice");
        require(!timelock.isLocked(tokenId), "Should no longer be locked");
    }
}
