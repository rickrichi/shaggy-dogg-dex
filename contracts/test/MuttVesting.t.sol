// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { MuttRewards } from "../src/MuttRewards.sol";
import { MuttVesting } from "../src/MuttVesting.sol";

interface VestVm {
    function prank(address) external;
    function warp(uint256) external;
}

contract MuttVestingTest {
    VestVm constant vm = VestVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MuttRewards token;
    MuttVesting vesting;
    address constant TEAM = address(0x7EA);
    address constant EVE = address(0xE7E);
    uint64 constant LAUNCH = 1_800_000_000;
    uint256 constant TEAM_SHARE = 50_000_000_000 ether; // 5% of supply

    function setUp() public {
        vm.warp(LAUNCH);
        token = new MuttRewards(address(this));
        vesting = new MuttVesting(TEAM, LAUNCH);
        require(token.transfer(address(vesting), TEAM_SHARE), "fund");
    }

    function _vested(uint256 t) internal view returns (uint256) {
        return vesting.vestedAmount(address(token), uint64(t));
    }

    function testScheduleIsTwelveMonthCliffThenThirtySixMonths() public view {
        require(vesting.start() == LAUNCH + 365 days, "start at cliff");
        require(vesting.end() == LAUNCH + 4 * 365 days, "end after 48 months");
        require(vesting.owner() == TEAM, "beneficiary");
    }
    function testNothingVestsBeforeTheCliff() public {
        require(_vested(LAUNCH + 365 days - 1) == 0, "before cliff");
        require(_vested(LAUNCH + 365 days) == 0, "at cliff, no lump");
        vm.warp(LAUNCH + 200 days);
        vesting.release(address(token));
        require(token.balanceOf(TEAM) == 0, "released early");
    }
    function testReleasesLinearlyAfterTheCliff() public {
        require(_vested(LAUNCH + 365 days + 547.5 days) == TEAM_SHARE / 2, "half way");
        require(_vested(LAUNCH + 4 * 365 days) == TEAM_SHARE, "all at end");
        vm.warp(LAUNCH + 365 days + 365 days); // one third of the 36 months
        vm.prank(EVE); // anyone may trigger release; tokens still go to the team
        vesting.release(address(token));
        require(token.balanceOf(TEAM) == TEAM_SHARE / 3, "one third");
        require(token.balanceOf(EVE) == 0, "caller gets nothing");
        vm.warp(LAUNCH + 10 * 365 days);
        vesting.release(address(token));
        require(token.balanceOf(TEAM) == TEAM_SHARE && token.balanceOf(address(vesting)) == 0, "all");
    }
    function testBeneficiaryCannotBeChanged() public {
        vm.prank(TEAM);
        try vesting.transferOwnership(EVE) { revert("transferred"); } catch {}
        vm.prank(TEAM);
        try vesting.renounceOwnership() { revert("renounced"); } catch {}
        require(vesting.owner() == TEAM, "still team");
    }
}
