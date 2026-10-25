// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttIncentiveScheduler, IUniswapV3StakerLike } from "../src/MuttIncentiveScheduler.sol";
import { MuttRewards } from "../src/MuttRewards.sol";

interface SchedForkVm {
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
    function warp(uint256) external;
}
interface V3FactoryLike {
    function createPool(address, address, uint24) external returns (address);
}
interface V3PoolLike {
    function initialize(uint160) external;
}
interface RealStakerLike {
    function incentives(bytes32) external view returns (uint256, uint160, uint96);
}

/// @notice Runs the scheduler against Uniswap's real UniswapV3Staker on a Base fork. Returns early
///         without BASE_FORK_RPC_URL, so a pass without it does not prove these assertions ran.
contract MuttIncentiveSchedulerForkTest {
    SchedForkVm constant vm = SchedForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant STAKER = 0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1;
    address constant FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    function testRealStakerCreatesAndEndsAScheduledIncentive() public {
        string memory rpc = vm.envOr("BASE_FORK_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);

        MuttRewards token = new MuttRewards(address(this));
        address pool = V3FactoryLike(FACTORY).createPool(address(token), WETH, 3000);
        V3PoolLike(pool).initialize(2 ** 96); // any valid price; no liquidity is needed here

        MuttIncentiveScheduler.Period[] memory s = new MuttIncentiveScheduler.Period[](2);
        uint64 start = uint64(block.timestamp + 10 days);
        s[0] = MuttIncentiveScheduler.Period(1_000 ether, start, start + 30 days);
        s[1] = MuttIncentiveScheduler.Period(2_000 ether, start + 30 days, start + 60 days);
        MuttIncentiveScheduler sch =
            new MuttIncentiveScheduler(IUniswapV3StakerLike(STAKER), IERC20(address(token)), pool, s);
        require(sch.maxStartLeadTime() == 30 days && sch.maxDuration() == 730 days, "real staker limits");
        require(token.transfer(address(sch), sch.totalReserve()), "fund");

        sch.createIncentive(0);
        (uint256 unclaimed,, uint96 stakes) = RealStakerLike(STAKER).incentives(sch.incentiveId(0));
        require(unclaimed == 1_000 ether && stakes == 0, "incentive live on the real staker");

        // Period 1 is missed entirely and burned; period 0 ends with nobody staked, so the whole
        // amount refunds to the dead address through the real endIncentive.
        vm.warp(start + 30 days + 1);
        sch.skipMissedPeriod(1);
        sch.finalize(0, new uint256[](0));
        require(token.balanceOf(DEAD) == 3_000 ether, "both periods reached 0xdEaD");
        (unclaimed,,) = RealStakerLike(STAKER).incentives(sch.incentiveId(0));
        require(unclaimed == 0 && token.balanceOf(address(sch)) == 0, "nothing stranded");
    }
}
