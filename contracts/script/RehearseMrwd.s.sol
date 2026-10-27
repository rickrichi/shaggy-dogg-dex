// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttIncentiveScheduler, IUniswapV3StakerLike } from "../src/MuttIncentiveScheduler.sol";
import { MuttProStaking } from "../src/MuttProStaking.sol";
import { MuttRewards } from "../src/MuttRewards.sol";
import { MuttVesting } from "../src/MuttVesting.sol";
import { V3PositionTimelock } from "../src/V3PositionTimelock.sol";

/*
 * Mutt Rewards rehearsal on Base Sepolia (whitepaper v2.0 §17, condition 5). Four phases, because
 * real time must pass between them:
 *
 *   phase1  deploy the Uniswap V3 Staker (Uniswap's v1.0.2 build, the same code as on Base),
 *           MRWD, the MRWD/WETH pool, the scheduler (three 2-hour periods starting in 20 minutes),
 *           Pro staking, team and treasury vesting; mint the launch position in a ¼×–4× range and
 *           lock it; create period 0's incentive; stake for Pro.            Needs ~0.0012 ETH.
 *   phase2  (after period 0 starts, +20 min) mint a community position and stake it in period 0.
 *   phase3  (after period 0 ends, +2 h 20 min) unstake, claim, withdraw the position; skip the
 *           missed period 1 to 0x…dEaD; finalize period 0 (remainder to 0x…dEaD); create period 2.
 *   phase4  (after period 2 ends, +6 h 20 min) finalize period 2 and burn the leftover.
 *
 * Run each phase with your own signer, for example:
 *   forge script script/RehearseMrwd.s.sol --root contracts --sig "phase1()" \
 *     --rpc-url https://sepolia.base.org --account <keystore-name> --broadcast
 * then export the addresses phase1 prints (MRWD, STAKER, SCHEDULER) for later phases, plus TOKEN_ID
 * from phase2. Amounts the script prints come from forge's pre-broadcast simulation; the staker's
 * reward for a position unstaked after its period ends still shifts slightly with time, so check
 * final balances on the explorer or with `cast call` (the dry run on a local fork matched exactly). Nothing here touches Base mainnet: phase1 refuses any chain but Base
 * Sepolia (84532) or a local fork of it (31337).
 */

/// Forge's console, called the way forge-std's console.sol does it: a raw staticcall, since the
/// console address has no code and a typed call would fail Solidity's code-size check.
library Log {
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

interface IVmScript {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envAddress(string calldata) external view returns (address);
    function envUint(string calldata) external view returns (uint256);
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
}

interface INpm {
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

    function factory() external view returns (address);
    function WETH9() external view returns (address);
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
    function approve(address, uint256) external;
    function safeTransferFrom(address, address, uint256, bytes calldata) external;
    function ownerOf(uint256) external view returns (address);
}

interface IFactory {
    function createPool(address, address, uint24) external returns (address);
}

interface IPool {
    function initialize(uint160) external;
}

interface IWeth {
    function deposit() external payable;
    function approve(address, uint256) external returns (bool);
}

interface IStakerFull {
    function unstakeToken(IUniswapV3StakerLike.IncentiveKey memory, uint256) external;
    function claimReward(address, address, uint256) external returns (uint256);
    function withdrawToken(uint256, address, bytes memory) external;
    function rewards(address, address) external view returns (uint256);
    function incentives(bytes32) external view returns (uint256, uint160, uint96);
}

contract RehearseMrwd {
    IVmScript constant vm = IVmScript(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// Base Sepolia Uniswap V3 NonfungiblePositionManager; the factory and WETH are read from it.
    address constant SEPOLIA_NPM = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint24 constant FEE = 3000;
    // Launch price 1 WETH = 1,000,000,000 MRWD, tick ±207240; ¼×–4× is ±13860 ticks (spacing 60).
    int24 constant LAUNCH_TICK = 207_240;
    int24 constant HALF_RANGE = 13_860;
    uint160 constant SQRT_MRWD_TOKEN1 = 2505036234966386302045715536678301;
    uint160 constant SQRT_MRWD_TOKEN0 = 2505792789648373978831110;
    uint256 constant WETH_PER_POSITION = 0.0005 ether;
    uint256 constant MRWD_PER_POSITION = 500_000 ether;
    uint128 constant PERIOD_AMOUNT = 1_000_000 ether;
    uint64 constant PERIOD = 2 hours;

    // ── phase 1 ─────────────────────────────────────────────────────────────

    function phase1() external {
        require(block.chainid == 84532 || block.chainid == 31337, "Base Sepolia only");
        INpm npm = INpm(SEPOLIA_NPM);
        address weth = npm.WETH9();
        vm.startBroadcast();
        address me = msg.sender;

        bytes memory creation = vm.parseJsonBytes(vm.readFile("vendor/UniswapV3Staker-1.0.2.json"), ".bytecode");
        bytes memory init = abi.encodePacked(creation, abi.encode(npm.factory(), address(npm), 30 days, 730 days));
        address staker;
        assembly { staker := create(0, add(init, 0x20), mload(init)) }
        require(staker != address(0), "staker deploy failed");

        MuttRewards mrwd = new MuttRewards(me);
        bool mrwdIsToken0 = address(mrwd) < weth;
        address pool = IFactory(npm.factory()).createPool(address(mrwd), weth, FEE);
        IPool(pool).initialize(mrwdIsToken0 ? SQRT_MRWD_TOKEN0 : SQRT_MRWD_TOKEN1);

        uint64 start = uint64(block.timestamp + 20 minutes);
        MuttIncentiveScheduler.Period[] memory s = new MuttIncentiveScheduler.Period[](3);
        for (uint256 i; i < 3; i++) {
            uint64 st = start + uint64(i) * PERIOD;
            s[i] = MuttIncentiveScheduler.Period(PERIOD_AMOUNT, st, st + PERIOD);
        }
        MuttIncentiveScheduler scheduler =
            new MuttIncentiveScheduler(IUniswapV3StakerLike(staker), IERC20(address(mrwd)), pool, s);
        // One extra MRWD so phase 4 can exercise burnLeftover.
        require(mrwd.transfer(address(scheduler), scheduler.totalReserve() + 1 ether), "fund scheduler");

        uint256 launchId = _mintPosition(npm, mrwd, weth, me);
        V3PositionTimelock locker = new V3PositionTimelock(address(npm));
        npm.approve(address(locker), launchId);
        locker.lockPosition(launchId, block.timestamp + 1 days);

        scheduler.createIncentive(0);

        MuttProStaking pro = new MuttProStaking(IERC20(address(mrwd)), 1 days);
        mrwd.approve(address(pro), 1_000 ether);
        pro.stake(1_000 ether);

        MuttVesting team = new MuttVesting(me, uint64(block.timestamp));
        MuttVesting treasury = new MuttVesting(me, uint64(block.timestamp));
        require(mrwd.transfer(address(team), 1_000 ether) && mrwd.transfer(address(treasury), 1_000 ether), "vest");
        vm.stopBroadcast();

        Log.log("export STAKER=", staker);
        Log.log("export MRWD=", address(mrwd));
        Log.log("export SCHEDULER=", address(scheduler));
        Log.log("POOL", pool);
        Log.log("LOCKER", address(locker));
        Log.log("launch position (locked 1 day)", launchId);
        Log.log("PRO_STAKING", address(pro));
        Log.log("TEAM_VESTING", address(team));
        Log.log("TREASURY_VESTING", address(treasury));
        Log.log("period 0 starts at", uint256(start));
    }

    // ── phase 2 ─────────────────────────────────────────────────────────────

    function phase2() external {
        (INpm npm, MuttRewards mrwd, MuttIncentiveScheduler scheduler, address staker) = _load();
        vm.startBroadcast();
        address me = msg.sender;
        uint256 id = _mintPosition(npm, mrwd, npm.WETH9(), me);
        npm.safeTransferFrom(me, staker, id, abi.encode(scheduler.incentiveKey(0)));
        vm.stopBroadcast();
        Log.log("export TOKEN_ID=", id);
    }

    // ── phase 3 ─────────────────────────────────────────────────────────────

    function phase3() external {
        (INpm npm, MuttRewards mrwd, MuttIncentiveScheduler scheduler, address staker) = _load();
        uint256 id = vm.envUint("TOKEN_ID");
        vm.startBroadcast();
        address me = msg.sender;
        IStakerFull(staker).unstakeToken(scheduler.incentiveKey(0), id);
        uint256 earned = IStakerFull(staker).rewards(address(mrwd), me);
        IStakerFull(staker).claimReward(address(mrwd), me, 0);
        IStakerFull(staker).withdrawToken(id, me, "");
        scheduler.skipMissedPeriod(1);
        scheduler.finalize(0, new uint256[](0));
        scheduler.createIncentive(2);
        vm.stopBroadcast();
        require(npm.ownerOf(id) == me, "position back with its owner");
        Log.log("MRWD earned by the community position (simulated)", earned);
        Log.log("MRWD at 0xdEaD, missed period 1 + period 0 remainder (simulated)", mrwd.balanceOf(DEAD));
    }

    // ── phase 4 ─────────────────────────────────────────────────────────────

    function phase4() external {
        (, MuttRewards mrwd, MuttIncentiveScheduler scheduler, address staker) = _load();
        (uint256 unclaimed,, uint96 stakes) = IStakerFull(staker).incentives(scheduler.incentiveId(2));
        Log.log("period 2 unclaimed before finalize", unclaimed);
        Log.log("period 2 positions staked", uint256(stakes));
        Log.log("MRWD at 0xdEaD before phase 4", mrwd.balanceOf(DEAD));
        Log.log("MRWD in the scheduler before phase 4", mrwd.balanceOf(address(scheduler)));
        vm.startBroadcast();
        scheduler.finalize(2, new uint256[](0));
        scheduler.burnLeftover();
        vm.stopBroadcast();
        Log.log("MRWD left in the scheduler", mrwd.balanceOf(address(scheduler)));
        Log.log("MRWD at 0xdEaD", mrwd.balanceOf(DEAD));
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    function _load() internal view returns (INpm, MuttRewards, MuttIncentiveScheduler, address) {
        return (
            INpm(SEPOLIA_NPM),
            MuttRewards(vm.envAddress("MRWD")),
            MuttIncentiveScheduler(vm.envAddress("SCHEDULER")),
            vm.envAddress("STAKER")
        );
    }

    /// Mints a ¼×–4× position around the launch price; call inside a broadcast.
    function _mintPosition(INpm npm, MuttRewards mrwd, address weth, address me) internal returns (uint256 id) {
        IWeth(weth).deposit{ value: WETH_PER_POSITION }();
        IWeth(weth).approve(address(npm), WETH_PER_POSITION);
        mrwd.approve(address(npm), MRWD_PER_POSITION);
        bool mrwdIsToken0 = address(mrwd) < weth;
        int24 center = mrwdIsToken0 ? -LAUNCH_TICK : LAUNCH_TICK;
        (id,,,) = npm.mint(
            INpm.MintParams({
                token0: mrwdIsToken0 ? address(mrwd) : weth,
                token1: mrwdIsToken0 ? weth : address(mrwd),
                fee: FEE,
                tickLower: center - HALF_RANGE,
                tickUpper: center + HALF_RANGE,
                amount0Desired: mrwdIsToken0 ? MRWD_PER_POSITION : WETH_PER_POSITION,
                amount1Desired: mrwdIsToken0 ? WETH_PER_POSITION : MRWD_PER_POSITION,
                amount0Min: 0,
                amount1Min: 0,
                recipient: me,
                deadline: block.timestamp + 20 minutes
            })
        );
    }
}
