// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttIncentiveScheduler, IUniswapV3StakerLike } from "../src/MuttIncentiveScheduler.sol";
import { MuttRewards } from "../src/MuttRewards.sol";
import { BaseForkSupport, ForkToken } from "./BaseForkSupport.sol";

interface V3FactoryLike {
    function createPool(address, address, uint24) external returns (address);
}

interface V3PoolLike {
    function initialize(uint160) external;
}

interface PositionManagerLike {
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
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
    function safeTransferFrom(address, address, uint256, bytes calldata) external;
}

/// The real UniswapV3Staker's public state and reward claim (v1.0.x).
interface RealStakerLike {
    function incentives(bytes32) external view returns (uint256 unclaimed, uint160 secondsClaimed, uint96 stakes);
    function rewards(address rewardToken, address owner) external view returns (uint256);
    function claimReward(address rewardToken, address to, uint256 amountRequested) external returns (uint256);
}

/// MuttIncentiveScheduler against Uniswap's real UniswapV3Staker on a Base fork, with a real V3
/// pool and a real staked liquidity position. No mock staker.
contract MuttIncentiveSchedulerTest is BaseForkSupport {
    address constant STAKER = 0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1;
    address constant V3_FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address constant POSITIONS = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant LP = address(0x1B);
    uint128 constant PERIOD_AMOUNT = 150_000_000_000 ether; // four periods = the 60% reserve

    uint256 T0;
    MuttRewards token;
    address pool;

    function setUp() public {
        _fork();
        T0 = block.timestamp;
        token = new MuttRewards(address(this));
        pool = V3FactoryLike(V3_FACTORY).createPool(address(token), WETH, 3000);
        V3PoolLike(pool).initialize(2 ** 96); // 1 MRWD = 1 WETH; only the staked position's range matters
    }

    /// Four back-to-back 12-month periods, the first starting 10 days from now.
    function _schedule() internal view returns (MuttIncentiveScheduler.Period[] memory s) {
        s = new MuttIncentiveScheduler.Period[](4);
        for (uint256 i; i < 4; i++) {
            uint64 start = uint64(T0 + 10 days + i * 365 days);
            s[i] = MuttIncentiveScheduler.Period(PERIOD_AMOUNT, start, start + 365 days);
        }
    }

    function _deploy(MuttIncentiveScheduler.Period[] memory s) internal returns (MuttIncentiveScheduler) {
        return new MuttIncentiveScheduler(IUniswapV3StakerLike(STAKER), IERC20(address(token)), pool, s);
    }

    function _funded() internal returns (MuttIncentiveScheduler sch) {
        sch = _deploy(_schedule());
        require(token.transfer(address(sch), sch.totalReserve()), "fund");
    }

    function _unclaimed(MuttIncentiveScheduler sch, uint256 i) internal view returns (uint256 u) {
        (u,,) = RealStakerLike(STAKER).incentives(sch.incentiveId(i));
    }

    /// Mints a real full-range MRWD/WETH position to the LP and stakes it in `key`'s incentive.
    function _stakeRealPosition(IUniswapV3StakerLike.IncentiveKey memory key) internal returns (uint256 tokenId) {
        _wrapEth(1 ether);
        ForkToken(WETH).approve(POSITIONS, 1 ether);
        token.approve(POSITIONS, 1 ether);
        (address t0, address t1) = address(token) < WETH ? (address(token), WETH) : (WETH, address(token));
        (tokenId,,,) = PositionManagerLike(POSITIONS).mint(
            PositionManagerLike.MintParams(t0, t1, 3000, -887220, 887220, 1 ether, 1 ether, 0, 0, LP, block.timestamp)
        );
        vm.prank(LP);
        PositionManagerLike(POSITIONS).safeTransferFrom(LP, STAKER, tokenId, abi.encode(key));
    }

    // ── Schedule checks ──────────────────────────────────────────────────────

    function testScheduleIsFixedAtDeployment() public {
        MuttIncentiveScheduler sch = _deploy(_schedule());
        require(sch.periodCount() == 4 && sch.totalReserve() == 4 * uint256(PERIOD_AMOUNT), "reserve");
        require(sch.maxStartLeadTime() == 30 days && sch.maxDuration() == 730 days, "real staker limits read");
        IUniswapV3StakerLike.IncentiveKey memory key = sch.incentiveKey(1);
        require(key.pool == pool && key.refundee == DEAD && key.rewardToken == address(token), "key");
        require(key.startTime == T0 + 10 days + 365 days && key.endTime == T0 + 10 days + 730 days, "times");
    }

    function testRejectsBadSchedules() public {
        MuttIncentiveScheduler.Period[] memory s = _schedule();
        s[2].startTime = s[1].endTime - 1; // overlaps the previous period
        try this.deployExternal(s) { revert("overlap accepted"); } catch {}
        s = _schedule();
        s[0].startTime = uint64(T0 - 1); // starts in the past
        try this.deployExternal(s) { revert("past start accepted"); } catch {}
        s = _schedule();
        s[3].endTime = s[3].startTime + 731 days; // longer than one staker incentive allows
        try this.deployExternal(s) { revert("too long accepted"); } catch {}
        s = _schedule();
        s[1].amount = 0;
        try this.deployExternal(s) { revert("zero amount accepted"); } catch {}
        s = _schedule();
        s[0].endTime = s[0].startTime;
        try this.deployExternal(s) { revert("empty period accepted"); } catch {}
        try this.deployExternal(new MuttIncentiveScheduler.Period[](0)) { revert("empty schedule"); } catch {}
        try this.deployExternal(new MuttIncentiveScheduler.Period[](49)) { revert("too many periods"); } catch {}
    }

    function deployExternal(MuttIncentiveScheduler.Period[] memory s) external returns (MuttIncentiveScheduler) {
        return _deploy(s);
    }

    function testHasNoOwnerOrWithdrawal() public {
        MuttIncentiveScheduler sch = _funded();
        string[6] memory sigs = ["owner()", "withdraw(uint256)", "sweep(address)", "setSchedule(uint256)",
            "transfer(address,uint256)", "emergencyWithdraw()"];
        for (uint256 i; i < sigs.length; i++) {
            (bool ok,) = address(sch).call(abi.encodeWithSignature(sigs[i]));
            require(!ok, sigs[i]);
        }
    }

    // ── Creating incentives ─────────────────────────────────────────────────

    function testCreatesEachPeriodInsideItsWindowOnly() public {
        MuttIncentiveScheduler sch = _funded();
        (uint256 opens, uint256 closes) = sch.creationWindow(1);
        require(opens == closes - 30 days, "window is the staker's lead time");
        vm.warp(opens - 1);
        try sch.createIncentive(1) { revert("created too early"); } catch {}
        vm.warp(opens);
        vm.prank(LP); // anyone may call
        sch.createIncentive(1);
        require(_unclaimed(sch, 1) == PERIOD_AMOUNT, "funded on the real staker");
        require(token.allowance(address(sch), STAKER) == 0, "no allowance left");
        require(token.balanceOf(address(sch)) == 3 * uint256(PERIOD_AMOUNT), "only that amount left");
        try sch.createIncentive(1) { revert("created twice"); } catch {}
    }

    function testCannotCreateAfterThePeriodStarts() public {
        MuttIncentiveScheduler sch = _funded();
        vm.warp(T0 + 10 days + 1);
        try sch.createIncentive(0) { revert("created late"); } catch {}
    }

    /// The real staker always pulls the exact reward, so only the scheduler's own funding check can
    /// fail here (the former mock's "short pull" case cannot occur against the real contract).
    function testUnderfundedCreationReverts() public {
        MuttIncentiveScheduler sch = _deploy(_schedule());
        require(token.transfer(address(sch), PERIOD_AMOUNT - 1), "fund short");
        try sch.createIncentive(0) { revert("underfunded"); } catch {}
        require(token.transfer(address(sch), 1), "top up");
        sch.createIncentive(0);
        require(_unclaimed(sch, 0) == PERIOD_AMOUNT, "created once funded");
    }

    // ── Missed windows ──────────────────────────────────────────────────────

    function testMissedPeriodGoesToTheDeadAddress() public {
        MuttIncentiveScheduler sch = _funded();
        try sch.skipMissedPeriod(0) { revert("skipped before start"); } catch {}
        vm.warp(T0 + 10 days + 1);
        sch.skipMissedPeriod(0);
        require(token.balanceOf(DEAD) == PERIOD_AMOUNT, "burned");
        try sch.skipMissedPeriod(0) { revert("skipped twice"); } catch {}
        try sch.createIncentive(0) { revert("created after skip"); } catch {}
        // The next period is unaffected.
        (uint256 opens,) = sch.creationWindow(1);
        vm.warp(opens);
        sch.createIncentive(1);
        require(_unclaimed(sch, 1) == PERIOD_AMOUNT, "next period funded");
    }

    function testCreatedPeriodCannotBeSkipped() public {
        MuttIncentiveScheduler sch = _funded();
        sch.createIncentive(0);
        vm.warp(T0 + 11 days);
        try sch.skipMissedPeriod(0) { revert("skipped a created period"); } catch {}
    }

    // ── Finalization ────────────────────────────────────────────────────────

    function testFinalizeUnstakesThenRefundsTheRemainderToDead() public {
        MuttIncentiveScheduler sch = _funded();
        sch.createIncentive(0);
        IUniswapV3StakerLike.IncentiveKey memory key = sch.incentiveKey(0);

        // A real LP stakes halfway through the period and earns the second half's rewards.
        vm.warp(key.startTime + 182 days);
        uint256 tokenId = _stakeRealPosition(key);
        (,, uint96 stakes) = RealStakerLike(STAKER).incentives(sch.incentiveId(0));
        require(stakes == 1, "position staked on the real staker");

        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        try sch.finalize(0, ids) { revert("finalized early"); } catch {}
        vm.warp(key.endTime);
        try sch.finalize(0, new uint256[](0)) { revert("ended with stakes"); } catch {}
        vm.prank(LP); // anyone may finalize
        sch.finalize(0, ids);

        uint256 earned = RealStakerLike(STAKER).rewards(address(token), LP);
        require(earned > 0 && earned < PERIOD_AMOUNT, "LP earned part of the period");
        require(token.balanceOf(DEAD) == PERIOD_AMOUNT - earned, "unearned remainder burned");
        vm.prank(LP);
        RealStakerLike(STAKER).claimReward(address(token), LP, 0);
        require(token.balanceOf(LP) == earned, "earned rewards kept by the LP");
        require(_unclaimed(sch, 0) == 0, "nothing stranded on the staker");
    }

    function testCannotFinalizeAPeriodThatWasNeverCreated() public {
        MuttIncentiveScheduler sch = _funded();
        vm.warp(T0 + 10 days + 366 days);
        try sch.finalize(0, new uint256[](0)) { revert("finalized pending"); } catch {}
    }

    function testMissedAndUnstakedPeriodsBothReachTheDeadAddress() public {
        MuttIncentiveScheduler.Period[] memory s = new MuttIncentiveScheduler.Period[](2);
        uint64 start = uint64(T0 + 10 days);
        s[0] = MuttIncentiveScheduler.Period(1_000 ether, start, start + 30 days);
        s[1] = MuttIncentiveScheduler.Period(2_000 ether, start + 30 days, start + 60 days);
        MuttIncentiveScheduler sch = _deploy(s);
        require(token.transfer(address(sch), sch.totalReserve()), "fund");
        sch.createIncentive(0);
        vm.warp(start + 30 days + 1);
        sch.skipMissedPeriod(1);
        sch.finalize(0, new uint256[](0)); // nobody staked: the real endIncentive refunds everything
        require(token.balanceOf(DEAD) == 3_000 ether, "both periods reached 0xdEaD");
        require(_unclaimed(sch, 0) == 0 && token.balanceOf(address(sch)) == 0, "nothing stranded");
    }

    // ── Leftovers and the full schedule ────────────────────────────────────

    function testLeftoverOnlyBurnsOnceEveryPeriodIsSettled() public {
        MuttIncentiveScheduler sch = _funded();
        require(token.transfer(address(sch), 5 ether), "excess sent by mistake");
        try sch.burnLeftover() { revert("burned while pending"); } catch {}
        for (uint256 i; i < 4; i++) {
            (uint256 opens,) = sch.creationWindow(i);
            vm.warp(opens);
            sch.createIncentive(i);
        }
        sch.burnLeftover();
        require(token.balanceOf(DEAD) == 5 ether && token.balanceOf(address(sch)) == 0, "excess burned");
        try sch.burnLeftover() { revert("nothing left"); } catch {}
    }

    function testFullScheduleReleasesExactlyTheReserve() public {
        MuttIncentiveScheduler sch = _funded();
        uint256 reserve = sch.totalReserve();
        for (uint256 i; i < 4; i++) {
            (, uint256 closes) = sch.creationWindow(i);
            vm.warp(closes); // the last possible moment still works
            sch.createIncentive(i);
            (MuttIncentiveScheduler.Period memory p, MuttIncentiveScheduler.Status st) = sch.period(i);
            require(st == MuttIncentiveScheduler.Status.Created && _unclaimed(sch, i) == p.amount, "created");
        }
        require(token.balanceOf(STAKER) == reserve && token.balanceOf(address(sch)) == 0, "all released");
    }
}
