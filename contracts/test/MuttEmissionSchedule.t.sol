// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttEmissionSchedule } from "../src/MuttEmissionSchedule.sol";
import { MuttIncentiveScheduler, IUniswapV3StakerLike } from "../src/MuttIncentiveScheduler.sol";
import { MuttRewards } from "../src/MuttRewards.sol";
import { MockStaker } from "./MuttIncentiveScheduler.t.sol";

interface EmitVm {
    function warp(uint256) external;
}

contract MuttEmissionScheduleTest {
    EmitVm constant vm = EmitVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint64 constant START = 1_800_000_000;

    function testTotalsTheReserveExactly() public pure {
        MuttIncentiveScheduler.Period[] memory s = MuttEmissionSchedule.build(START);
        uint256 total;
        for (uint256 i; i < s.length; i++) total += s[i].amount;
        require(s.length == 16 && total == 600_000_000_000 ether, "600B over 16 quarters");
    }
    function testFollowsTheModelCurve() public pure {
        MuttIncentiveScheduler.Period[] memory s = MuttEmissionSchedule.build(START);
        // Quarter 1 is 55.452…B and quarter 16 is 19.548…B, declining every quarter.
        require(s[0].amount / 1e27 == 55 && s[0].amount % 1e27 / 1e25 == 45, "first quarter 55.45B");
        require(s[15].amount / 1e27 == 19 && s[15].amount % 1e27 / 1e25 == 54, "last quarter 19.548B");
        for (uint256 i = 1; i < s.length; i++) require(s[i].amount < s[i - 1].amount, "declining");
    }
    function testQuartersAreBackToBackOverFourYears() public pure {
        MuttIncentiveScheduler.Period[] memory s = MuttEmissionSchedule.build(START);
        require(s[0].startTime == START && s[15].endTime == START + 4 * 365 days, "48 months");
        for (uint256 i = 1; i < s.length; i++) require(s[i].startTime == s[i - 1].endTime, "no gaps");
    }
    function testSchedulerAcceptsTheCurve() public {
        vm.warp(START - 10 days);
        MuttRewards token = new MuttRewards(address(this));
        MuttIncentiveScheduler sch = new MuttIncentiveScheduler(
            IUniswapV3StakerLike(address(new MockStaker())), IERC20(address(token)), address(0x9001),
            MuttEmissionSchedule.build(START)
        );
        require(sch.totalReserve() == 600_000_000_000 ether && sch.periodCount() == 16, "accepted");
    }
}
