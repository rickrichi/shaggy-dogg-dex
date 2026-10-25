// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { MuttEmissionSchedule } from "../src/MuttEmissionSchedule.sol";
import { MuttIncentiveScheduler, IUniswapV3StakerLike } from "../src/MuttIncentiveScheduler.sol";
import { MuttProStaking } from "../src/MuttProStaking.sol";
import { MuttRewards } from "../src/MuttRewards.sol";
import { MuttVesting } from "../src/MuttVesting.sol";
import { V3PositionTimelock } from "../src/V3PositionTimelock.sol";

/*
 * USED ONCE, 25 October 2026; do not reuse as written. Forge broadcasts calldata computed in its
 * simulation, so the locker approval named the simulated position (6351507) while the real mint,
 * after other users' mints, returned 6351512; the run stopped there and FinishMrwdLaunch.s.sol
 * completed the launch. A reusable version must mint and lock in one on-chain call or read the
 * position id from chain in a second run. Record: deployments/mrwd-base-mainnet.json.
 *
 * Mutt Rewards launch on Base mainnet (whitepaper v2.0 §13–§15), in one run:
 *
 *   1. MRWD: 1 trillion minted to the signer, who passes all of it on in this run.
 *   2. The MRWD/WETH 0.30% pool, initialized at LAUNCH_WETH / LAUNCH_MRWD.
 *   3. The incentive scheduler with the 16-quarter curve, funded with 600 billion (60%).
 *   4. The ¼×–4× launch position (LAUNCH_MRWD of the 20%, plus LAUNCH_WETH), locked 24 months in
 *      the project's V3PositionTimelock. Launch MRWD the position cannot take, and any of the 20%
 *      not paired, goes to 0x…dEaD.
 *   5. Treasury vesting (150 billion, 15%) and team vesting (50 billion, 5%).
 *   6. Pro staking with a PRO_LOCK_DAYS lock (default 30).
 *   7. Quarter 1's incentive on Uniswap's Base staker, starting FIRST_PERIOD_DELAY seconds after
 *      the run (default 1 hour).
 *
 * The run ends with the signer holding no MRWD. The vesting wallets are fixed below (chosen
 * 25 October 2026). By default the launch pairs all of the signer's ETH except GAS_RESERVE for
 * gas. Optional environment overrides:
 *   LAUNCH_WETH                    WETH paired, in wei, instead of the balance-based default
 *   LAUNCH_MRWD                    whole MRWD paired, default 200,000,000,000
 *   PRO_LOCK_DAYS, FIRST_PERIOD_DELAY
 *
 * Simulate first (no --broadcast) and read the logged amounts, then broadcast:
 *   forge script script/LaunchMrwd.s.sol --rpc-url https://mainnet.base.org \
 *     --account mrwd-sepolia --sender 0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98 [--broadcast --slow]
 */

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

    function log(string memory label, int256 value) internal view {
        (bool ok,) = CONSOLE.staticcall(abi.encodeWithSignature("log(string,int256)", label, value));
        ok;
    }
}

interface IVmLaunch {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envAddress(string calldata) external view returns (address);
    function envUint(string calldata) external view returns (uint256);
    function envOr(string calldata, uint256) external view returns (uint256);
}

interface INpmLaunch {
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
    function ownerOf(uint256) external view returns (address);
}

interface IFactoryLaunch {
    function createPool(address, address, uint24) external returns (address);
}

interface IPoolLaunch {
    function initialize(uint160) external;
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
}

interface IWethLaunch {
    function deposit() external payable;
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract LaunchMrwd {
    IVmLaunch constant vm = IVmLaunch(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// Canonical Base Uniswap V3 position manager (§13.1); factory and WETH are read from it.
    INpmLaunch constant NPM = INpmLaunch(0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1);
    /// Uniswap's V3 Staker on Base (§14.1).
    address constant STAKER = 0x42bE4D6527829FeFA1493e1fb9F3676d2425C3C1;
    /// The project's V3PositionTimelock on Base (§13.2), wired to NPM.
    V3PositionTimelock constant LOCKER = V3PositionTimelock(0xB5C9BeDb57f4E348e40A5E6326c90dE474072E25);
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint24 constant FEE = 3000;
    int24 constant TICK_SPACING = 60;
    /// ¼× to 4× the launch price: ln 4 / ln 1.0001 ≈ 13,863 ticks, rounded to the spacing.
    int24 constant HALF_RANGE = 13_860;
    uint256 constant LOCK = 730 days;

    uint256 constant TREASURY = 150_000_000_000 ether;
    uint256 constant TEAM = 50_000_000_000 ether;
    uint256 constant LAUNCH_ALLOCATION = 200_000_000_000 ether;

    /// Vesting beneficiaries (§15), fixed forever once deployed.
    address constant TEAM_WALLET = 0x88D67A5fEAafd4501B0E3510ebb3533b7d8245f2;
    address constant TREASURY_WALLET = 0xB04A0b807BCD463351F90133242F0AcA15C2280f;
    /// ETH the signer keeps for gas; the launch uses about 0.00015 ETH at Base's usual fees.
    uint256 constant GAS_RESERVE = 0.0015 ether;

    // Script state, kept in storage so run() stays within the stack limit.
    address weth;
    address me;
    MuttRewards mrwd;
    address pool;
    MuttIncentiveScheduler scheduler;
    uint256 launchId;
    MuttVesting treasury;
    MuttVesting team;
    MuttProStaking pro;
    uint256 unused;

    function run() external {
        require(block.chainid == 8453 || block.chainid == 31337, "Base mainnet only");
        uint256 launchMrwd = vm.envOr("LAUNCH_MRWD", 200_000_000_000) * 1 ether;
        uint64 firstStart = uint64(block.timestamp + vm.envOr("FIRST_PERIOD_DELAY", 1 hours));
        require(launchMrwd > 0 && launchMrwd <= LAUNCH_ALLOCATION, "launch MRWD");
        require(address(LOCKER.positionManager()) == address(NPM), "locker wiring");
        weth = NPM.WETH9();

        vm.startBroadcast();
        me = msg.sender;
        require(me.balance > GAS_RESERVE, "signer needs more than 0.0015 ETH");
        uint256 launchWeth = vm.envOr("LAUNCH_WETH", me.balance - GAS_RESERVE);
        require(launchWeth > 0 && launchWeth + GAS_RESERVE <= me.balance, "LAUNCH_WETH leaves too little for gas");
        Log.log("LAUNCH WETH paired (wei)", launchWeth);
        _deployTokenAndPool(launchMrwd, launchWeth);
        scheduler = new MuttIncentiveScheduler(
            IUniswapV3StakerLike(STAKER), IERC20(address(mrwd)), pool, MuttEmissionSchedule.build(firstStart)
        );
        require(mrwd.transfer(address(scheduler), scheduler.totalReserve()), "fund scheduler");
        _mintAndLockLaunchPosition(launchMrwd, launchWeth);
        treasury = new MuttVesting(TREASURY_WALLET, uint64(block.timestamp));
        team = new MuttVesting(TEAM_WALLET, uint64(block.timestamp));
        require(mrwd.transfer(address(treasury), TREASURY) && mrwd.transfer(address(team), TEAM), "fund vesting");
        pro = new MuttProStaking(IERC20(address(mrwd)), vm.envOr("PRO_LOCK_DAYS", 30) * 1 days);
        scheduler.createIncentive(0);
        // Whatever of the launch allocation the position did not take.
        unused = mrwd.balanceOf(me);
        if (unused > 0) require(mrwd.transfer(DEAD, unused), "unused launch MRWD");
        vm.stopBroadcast();

        require(mrwd.balanceOf(me) == 0, "signer keeps no MRWD");
        require(mrwd.balanceOf(address(scheduler)) == scheduler.totalReserve() - _periodAmount(0), "reserve");
        require(NPM.ownerOf(launchId) == address(LOCKER), "launch position locked");
        require(treasury.owner() == TREASURY_WALLET && team.owner() == TEAM_WALLET, "beneficiaries");
        _report(firstStart);
    }

    function _deployTokenAndPool(uint256 launchMrwd, uint256 launchWeth) internal {
        mrwd = new MuttRewards(me);
        pool = IFactoryLaunch(NPM.factory()).createPool(address(mrwd), weth, FEE);
        (uint256 amount0, uint256 amount1) = _amounts(launchMrwd, launchWeth);
        IPoolLaunch(pool).initialize(uint160(Math.sqrt(Math.mulDiv(amount1, 1 << 192, amount0))));
    }

    function _amounts(uint256 launchMrwd, uint256 launchWeth) internal view returns (uint256, uint256) {
        return address(mrwd) < weth ? (launchMrwd, launchWeth) : (launchWeth, launchMrwd);
    }

    function _report(uint64 firstStart) internal view {
        Log.log("MRWD", address(mrwd));
        Log.log("POOL", pool);
        Log.log("SCHEDULER", address(scheduler));
        Log.log("PRO_STAKING", address(pro));
        Log.log("TREASURY_VESTING", address(treasury));
        Log.log("TEAM_VESTING", address(team));
        Log.log("  treasury beneficiary", TREASURY_WALLET);
        Log.log("  team beneficiary", TEAM_WALLET);
        Log.log("LOCKER", address(LOCKER));
        Log.log("launch position", launchId);
        Log.log("launch position unlocks at", block.timestamp + LOCK);
        Log.log("unused launch MRWD sent to 0xdEaD (wei)", unused);
        Log.log("WETH left with the signer (wei)", IWethLaunch(weth).balanceOf(me));
        Log.log("quarter 1 starts at", uint256(firstStart));
        Log.log("quarter 2 can be created from", uint256(firstStart) + MuttEmissionSchedule.PERIOD_LENGTH - 30 days);
    }

    /// Mints the ¼×–4× position centred on the pool's starting tick and locks it; inside a broadcast.
    function _mintAndLockLaunchPosition(uint256 launchMrwd, uint256 launchWeth) internal {
        (, int24 tick,,,,,) = IPoolLaunch(pool).slot0();
        int24 center = _roundToSpacing(tick);
        bool mrwdFirst = address(mrwd) < weth;
        (uint256 amount0, uint256 amount1) = _amounts(launchMrwd, launchWeth);
        IWethLaunch(weth).deposit{ value: launchWeth }();
        IWethLaunch(weth).approve(address(NPM), launchWeth);
        mrwd.approve(address(NPM), launchMrwd);
        (launchId,,,) = NPM.mint(
            INpmLaunch.MintParams({
                token0: mrwdFirst ? address(mrwd) : weth,
                token1: mrwdFirst ? weth : address(mrwd),
                fee: FEE,
                tickLower: center - HALF_RANGE,
                tickUpper: center + HALF_RANGE,
                amount0Desired: amount0,
                amount1Desired: amount1,
                amount0Min: 0,
                amount1Min: 0,
                recipient: me,
                deadline: block.timestamp + 20 minutes
            })
        );
        IWethLaunch(weth).approve(address(NPM), 0);
        mrwd.approve(address(NPM), 0);
        NPM.approve(address(LOCKER), launchId);
        LOCKER.lockPosition(launchId, block.timestamp + LOCK);
        Log.log("starting tick", int256(tick));
    }

    function _periodAmount(uint256 i) internal view returns (uint256) {
        (MuttIncentiveScheduler.Period memory p,) = scheduler.period(i);
        return p.amount;
    }

    function _roundToSpacing(int24 tick) internal pure returns (int24) {
        int24 r = tick % TICK_SPACING;
        if (r < 0) r += TICK_SPACING;
        return r * 2 >= TICK_SPACING ? tick - r + TICK_SPACING : tick - r;
    }
}
