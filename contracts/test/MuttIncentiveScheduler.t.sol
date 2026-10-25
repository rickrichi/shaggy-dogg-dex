// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttIncentiveScheduler, IUniswapV3StakerLike } from "../src/MuttIncentiveScheduler.sol";
import { MuttRewards } from "../src/MuttRewards.sol";

interface SchedVm {
    function warp(uint256) external;
    function prank(address) external;
}

/// @dev Enforces the same createIncentive / unstakeToken / endIncentive rules as UniswapV3Staker
///      (v3-staker 1.0.x), with test hooks to stake, claim, and under-pull.
contract MockStaker {
    struct Incentive {
        uint256 totalRewardUnclaimed;
        uint96 numberOfStakes;
    }
    mapping(bytes32 => Incentive) public incentives;
    uint256 public constant maxIncentiveStartLeadTime = 30 days;
    uint256 public constant maxIncentiveDuration = 730 days;
    bool public pullLess;

    function setPullLess(bool v) external { pullLess = v; }
    function _id(IUniswapV3StakerLike.IncentiveKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }

    function createIncentive(IUniswapV3StakerLike.IncentiveKey memory key, uint256 reward) external {
        require(reward > 0, "reward must be positive");
        require(block.timestamp <= key.startTime, "start time must be now or in the future");
        require(key.startTime - block.timestamp <= maxIncentiveStartLeadTime, "start time too far into future");
        require(key.startTime < key.endTime, "start time must be before end time");
        require(key.endTime - key.startTime <= maxIncentiveDuration, "incentive duration is too long");
        incentives[_id(key)].totalRewardUnclaimed += reward;
        IERC20(key.rewardToken).transferFrom(msg.sender, address(this), pullLess ? reward - 1 : reward);
    }
    function stakeOne(IUniswapV3StakerLike.IncentiveKey memory key) external {
        incentives[_id(key)].numberOfStakes++;
    }
    function claim(IUniswapV3StakerLike.IncentiveKey memory key, uint256 amount, address to) external {
        incentives[_id(key)].totalRewardUnclaimed -= amount;
        IERC20(key.rewardToken).transfer(to, amount);
    }
    function unstakeToken(IUniswapV3StakerLike.IncentiveKey memory key, uint256) external {
        require(block.timestamp >= key.endTime, "only owner can withdraw token before incentive end time");
        incentives[_id(key)].numberOfStakes--;
    }
    function endIncentive(IUniswapV3StakerLike.IncentiveKey memory key) external returns (uint256 refund) {
        require(block.timestamp >= key.endTime, "cannot end incentive before end time");
        Incentive storage inc = incentives[_id(key)];
        refund = inc.totalRewardUnclaimed;
        require(refund > 0, "no refund available");
        require(inc.numberOfStakes == 0, "cannot end incentive while deposits are staked");
        inc.totalRewardUnclaimed = 0;
        IERC20(key.rewardToken).transfer(key.refundee, refund);
    }
}

contract MuttIncentiveSchedulerTest {
    SchedVm constant vm = SchedVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant POOL = address(0x9001);
    address constant LP = address(0x1B);
    uint256 constant T0 = 1_800_000_000;
    uint128 constant PERIOD_AMOUNT = 150_000_000_000 ether; // four periods = the 60% reserve

    MuttRewards token;
    MockStaker staker;

    function setUp() public {
        vm.warp(T0);
        token = new MuttRewards(address(this));
        staker = new MockStaker();
    }

    /// Four back-to-back 12-month periods, the first starting 10 days from now.
    function _schedule() internal pure returns (MuttIncentiveScheduler.Period[] memory s) {
        s = new MuttIncentiveScheduler.Period[](4);
        for (uint256 i; i < 4; i++) {
            uint64 start = uint64(T0 + 10 days + i * 365 days);
            s[i] = MuttIncentiveScheduler.Period(PERIOD_AMOUNT, start, start + 365 days);
        }
    }

    function _deploy(MuttIncentiveScheduler.Period[] memory s) internal returns (MuttIncentiveScheduler) {
        return new MuttIncentiveScheduler(
            IUniswapV3StakerLike(address(staker)), IERC20(address(token)), POOL, s
        );
    }

    function _funded() internal returns (MuttIncentiveScheduler sch) {
        sch = _deploy(_schedule());
        require(token.transfer(address(sch), sch.totalReserve()), "fund");
    }

    function _unclaimed(MuttIncentiveScheduler sch, uint256 i) internal view returns (uint256 u) {
        (u,) = staker.incentives(sch.incentiveId(i));
    }

    // ── Schedule checks ──────────────────────────────────────────────────────

    function testScheduleIsFixedAtDeployment() public {
        MuttIncentiveScheduler sch = _deploy(_schedule());
        require(sch.periodCount() == 4 && sch.totalReserve() == 4 * uint256(PERIOD_AMOUNT), "reserve");
        require(sch.maxStartLeadTime() == 30 days && sch.maxDuration() == 730 days, "staker limits read");
        IUniswapV3StakerLike.IncentiveKey memory key = sch.incentiveKey(1);
        require(key.pool == POOL && key.refundee == DEAD && key.rewardToken == address(token), "key");
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
        require(_unclaimed(sch, 1) == PERIOD_AMOUNT, "funded on the staker");
        require(token.allowance(address(sch), address(staker)) == 0, "no allowance left");
        require(token.balanceOf(address(sch)) == 3 * uint256(PERIOD_AMOUNT), "only that amount left");
        try sch.createIncentive(1) { revert("created twice"); } catch {}
    }
    function testCannotCreateAfterThePeriodStarts() public {
        MuttIncentiveScheduler sch = _funded();
        vm.warp(T0 + 10 days + 1);
        try sch.createIncentive(0) { revert("created late"); } catch {}
    }
    function testUnderfundedOrShortPulledCreationReverts() public {
        MuttIncentiveScheduler sch = _deploy(_schedule());
        require(token.transfer(address(sch), PERIOD_AMOUNT - 1), "fund short");
        try sch.createIncentive(0) { revert("underfunded"); } catch {}
        require(token.transfer(address(sch), 1), "top up");
        staker.setPullLess(true);
        try sch.createIncentive(0) { revert("short pull accepted"); } catch {}
        staker.setPullLess(false);
        sch.createIncentive(0);
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
        staker.stakeOne(key);
        staker.stakeOne(key);
        staker.claim(key, 40_000_000_000 ether, LP); // stakers earned part of the period
        uint256[] memory ids = new uint256[](2);
        ids[0] = 11;
        ids[1] = 12;
        try sch.finalize(0, ids) { revert("finalized early"); } catch {}
        vm.warp(T0 + 10 days + 365 days);
        try sch.finalize(0, new uint256[](0)) { revert("ended with stakes"); } catch {}
        vm.prank(LP); // anyone may finalize
        sch.finalize(0, ids);
        require(token.balanceOf(DEAD) == PERIOD_AMOUNT - 40_000_000_000 ether, "remainder burned");
        require(token.balanceOf(LP) == 40_000_000_000 ether, "earned rewards kept");
    }
    function testCannotFinalizeAPeriodThatWasNeverCreated() public {
        MuttIncentiveScheduler sch = _funded();
        vm.warp(T0 + 10 days + 366 days);
        try sch.finalize(0, new uint256[](0)) { revert("finalized pending"); } catch {}
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
        require(token.balanceOf(address(staker)) == reserve && token.balanceOf(address(sch)) == 0, "all released");
    }
}
