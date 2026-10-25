// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttIncentiveScheduler } from "../src/MuttIncentiveScheduler.sol";
import { MuttProStaking } from "../src/MuttProStaking.sol";
import { MuttRewards } from "../src/MuttRewards.sol";
import { MuttVesting } from "../src/MuttVesting.sol";
import { V3PositionTimelock } from "../src/V3PositionTimelock.sol";

/*
 * Completes the 25 October 2026 Mutt Rewards launch, which stopped after the launch position was
 * minted: forge's simulation predicted position 6351507, but other mints landed first and the real
 * position is 6351512, so the locker approval for 6351507 reverted. Everything before it is on
 * chain (MRWD, pool, funded scheduler, position in the signer's wallet). This script, in order:
 *
 *   1. creates quarter 1's incentive (it must exist before quarter 1 starts);
 *   2. locks position 6351512 for 24 months in V3PositionTimelock;
 *   3. deploys and funds treasury (150 billion) and team (50 billion) vesting;
 *   4. deploys Pro staking (30-day lock);
 *   5. sends the signer's remaining launch MRWD to 0x…dEaD.
 *
 *   forge script script/FinishMrwdLaunch.s.sol --rpc-url https://mainnet.base.org \
 *     --account mrwd-sepolia --sender 0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98 [--broadcast --slow]
 */

library FinishLog {
    address constant CONSOLE = 0x000000000000000000636F6e736F6c652e6c6f67;

    function log(string memory label, address value) internal view {
        (bool ok,) = CONSOLE.staticcall(abi.encodeWithSignature("log(string,address)", label, value));
        ok;
    }

    function log(string memory label, uint256 value) internal view {
        (bool ok,) = CONSOLE.staticcall(abi.encodeWithSignature("log(string,uint256)", label, value));
        ok;
    }
}

interface IVmFinish {
    function startBroadcast() external;
    function stopBroadcast() external;
}

interface INpmFinish {
    function approve(address, uint256) external;
    function ownerOf(uint256) external view returns (address);
    function positions(uint256)
        external
        view
        returns (uint96, address, address, address, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128);
}

contract FinishMrwdLaunch {
    IVmFinish constant vm = IVmFinish(address(uint160(uint256(keccak256("hevm cheat code")))));

    INpmFinish constant NPM = INpmFinish(0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1);
    V3PositionTimelock constant LOCKER = V3PositionTimelock(0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25);
    MuttRewards constant MRWD = MuttRewards(0xC17227AAa33C54634B6cE7AD0bf33A156563c179);
    MuttIncentiveScheduler constant SCHEDULER = MuttIncentiveScheduler(0xCAbf284806b800d9A771B55857B9fCF735ea7109);
    uint256 constant LAUNCH_ID = 6_351_512;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant TEAM_WALLET = 0x88D67A5fEAafd4501B0E3510ebb3533b7d8245f2;
    address constant TREASURY_WALLET = 0xB04A0b807BCD463351F90133242F0AcA15C2280f;
    uint256 constant TREASURY = 150_000_000_000 ether;
    uint256 constant TEAM = 50_000_000_000 ether;
    uint256 constant LOCK = 730 days;

    function run() external {
        require(block.chainid == 8453 || block.chainid == 31337, "Base mainnet only");
        (,,, address token1,,,,,,,,) = NPM.positions(LAUNCH_ID);
        require(token1 == address(MRWD), "position is not the MRWD launch position");

        vm.startBroadcast();
        address me = msg.sender;
        require(NPM.ownerOf(LAUNCH_ID) == me, "signer must hold the launch position");
        require(MRWD.balanceOf(me) >= TREASURY + TEAM, "signer must hold the vesting MRWD");

        (, MuttIncentiveScheduler.Status s0) = SCHEDULER.period(0);
        if (s0 == MuttIncentiveScheduler.Status.Pending) SCHEDULER.createIncentive(0);

        NPM.approve(address(LOCKER), LAUNCH_ID);
        LOCKER.lockPosition(LAUNCH_ID, block.timestamp + LOCK);

        MuttVesting treasury = new MuttVesting(TREASURY_WALLET, uint64(block.timestamp));
        MuttVesting team = new MuttVesting(TEAM_WALLET, uint64(block.timestamp));
        require(MRWD.transfer(address(treasury), TREASURY) && MRWD.transfer(address(team), TEAM), "fund vesting");

        MuttProStaking pro = new MuttProStaking(IERC20(address(MRWD)), 30 days);

        uint256 unused = MRWD.balanceOf(me);
        if (unused > 0) require(MRWD.transfer(DEAD, unused), "unused launch MRWD");
        vm.stopBroadcast();

        (, MuttIncentiveScheduler.Status s0After) = SCHEDULER.period(0);
        require(s0After == MuttIncentiveScheduler.Status.Created, "quarter 1 created");
        require(NPM.ownerOf(LAUNCH_ID) == address(LOCKER), "launch position locked");
        require(treasury.owner() == TREASURY_WALLET && team.owner() == TEAM_WALLET, "beneficiaries");
        require(MRWD.balanceOf(me) == 0, "signer keeps no MRWD");

        FinishLog.log("TREASURY_VESTING", address(treasury));
        FinishLog.log("TEAM_VESTING", address(team));
        FinishLog.log("PRO_STAKING", address(pro));
        FinishLog.log("launch position locked", LAUNCH_ID);
        FinishLog.log("unlocks at", block.timestamp + LOCK);
        FinishLog.log("unused launch MRWD sent to 0xdEaD (wei)", unused);
    }
}
