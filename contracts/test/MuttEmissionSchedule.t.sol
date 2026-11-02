// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttEmissionSchedule } from "../src/MuttEmissionSchedule.sol";
import { MuttIncentiveScheduler, IUniswapV3StakerLike } from "../src/MuttIncentiveScheduler.sol";
import { MuttRewards } from "../src/MuttRewards.sol";
import { BaseForkSupport } from "./BaseForkSupport.sol";

interface EmissionV3FactoryLike {
    function createPool(address, address, uint24) external returns (address);
}

contract MuttEmissionScheduleTest is BaseForkSupport {
    address constant STAKER = 0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1;
    address constant V3_FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
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
    /// The 16-quarter curve fits the real UniswapV3Staker's limits on Base.
    function testSchedulerAcceptsTheCurveOnTheRealStaker() public {
        _fork();
        uint64 start = uint64(block.timestamp + 10 days);
        MuttRewards token = new MuttRewards(address(this));
        address pool = EmissionV3FactoryLike(V3_FACTORY).createPool(address(token), WETH, 3000);
        MuttIncentiveScheduler sch = new MuttIncentiveScheduler(
            IUniswapV3StakerLike(STAKER), IERC20(address(token)), pool, MuttEmissionSchedule.build(start)
        );
        require(sch.totalReserve() == 600_000_000_000 ether && sch.periodCount() == 16, "accepted");
        require(token.transfer(address(sch), sch.totalReserve()), "fund");
        sch.createIncentive(0);
        (uint256 opens,) = sch.creationWindow(15);
        vm.warp(opens);
        for (uint256 i = 1; i < 16; i++) {
            (, uint256 closes) = sch.creationWindow(i);
            if (block.timestamp > closes) sch.skipMissedPeriod(i);
        }
        sch.createIncentive(15);
        require(token.balanceOf(address(sch)) == 0, "every quarter created or burned");
    }
}
