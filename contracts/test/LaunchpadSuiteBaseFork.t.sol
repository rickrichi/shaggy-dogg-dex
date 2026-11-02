// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FixedSupplyToken} from "../src/FixedSupplyToken.sol";
import {IComet} from "../src/Interfaces.sol";
import {LaunchpadSuiteDeployer} from "../src/LaunchpadSuiteDeployer.sol";
import {AtomicFlashArbitrageRouter} from "../src/AtomicFlashArbitrageRouter.sol";
import {CompoundYieldVault} from "../src/CompoundYieldVault.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";
import {YieldStakingVault} from "../src/YieldStakingVault.sol";
import {BaseForkSupport, ForkToken} from "./BaseForkSupport.sol";

/// The "Full Sovereign Protocol Suite" card as the launchpad deploys it, on a Base fork:
/// one staking contract feeding both vaults, real Aave and Compound markets, and the router.
contract LaunchpadSuiteBaseForkTest is BaseForkSupport {
    address internal constant ADMIN = address(0xAD317);
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);

    FixedSupplyToken internal token;
    FeeDiscountStaking internal staking;
    YieldStakingVault internal aaveVault;
    CompoundYieldVault internal compoundVault;
    AtomicFlashArbitrageRouter internal router;
    LaunchpadSuiteDeployer internal suite;

    function setUp() public {
        _fork();
        token = new FixedSupplyToken("Suite Check", "SUITE", address(this), LAUNCH_SUPPLY);
        LaunchpadSuiteDeployer.Config memory c;
        c.token = address(token);
        c.admin = ADMIN;
        c.lockSeconds = 7 days;
        c.unstakeFeeBps = 100;
        c.performanceFeeBps = 1000;
        c.tiers = _launchTiers();
        c.deployFullSuite = true;
        c.usdc = USDC;
        c.aavePool = AAVE_POOL;
        c.aUsdc = AUSDC;
        c.comet = COMET;
        suite = new LaunchpadSuiteDeployer(c);
        staking = FeeDiscountStaking(suite.staking());
        aaveVault = YieldStakingVault(suite.aaveVault());
        compoundVault = CompoundYieldVault(suite.compoundVault());
        router = AtomicFlashArbitrageRouter(payable(suite.arbitrageRouter()));

        for (uint256 i = 0; i < 2; i++) {
            address who = i == 0 ? ALICE : BOB;
            _buyUsdc(who, 15 ether);
            vm.startPrank(who);
            ForkToken(USDC).approve(address(aaveVault), type(uint256).max);
            ForkToken(USDC).approve(address(compoundVault), type(uint256).max);
            vm.stopPrank();
        }
    }

    function testEveryContractIsWiredToTheLaunch() public view {
        require(address(aaveVault) != address(0) && address(compoundVault) != address(0), "both vaults");
        require(address(router) != address(0), "router");
        require(address(staking.token()) == address(token) && staking.admin() == ADMIN, "staking");
        require(address(aaveVault.discountStaking()) == address(staking), "Aave vault reads the launch staking");
        require(address(compoundVault.discountStaking()) == address(staking), "Compound vault reads the launch staking");
        require(aaveVault.aavePool() == AAVE_POOL && aaveVault.aToken() == AUSDC, "canonical Aave market");
        require(address(compoundVault.comet()) == COMET && IComet(COMET).baseToken() == USDC, "canonical Comet");
        require(aaveVault.admin() == ADMIN && aaveVault.treasury() == ADMIN, "Aave roles");
        require(compoundVault.admin() == ADMIN && compoundVault.treasury() == ADMIN, "Compound roles");
        require(aaveVault.performanceFeeBps() == 1000 && compoundVault.performanceFeeBps() == 1000, "fees");
        require(router.admin() == ADMIN && router.aavePool() == AAVE_POOL, "router roles");
        require(!router.isOperator(address(suite)) && !router.isOperator(address(this)), "no leftover operators");
    }

    function testOneStakeDiscountsBothVaults() public {
        _stakeTopTier(token, staking, BOB);
        uint256[4] memory before = [_usdc(ALICE), _usdc(BOB), uint256(0), uint256(0)];
        vm.startPrank(ALICE);
        aaveVault.deposit(5_000e6);
        compoundVault.deposit(5_000e6);
        vm.stopPrank();
        vm.startPrank(BOB);
        aaveVault.deposit(5_000e6);
        compoundVault.deposit(5_000e6);
        vm.stopPrank();
        vm.warp(block.timestamp + 180 days);

        (uint256 aliceAaveFee, uint256 aliceAaveProfit) = _exit(ALICE, address(aaveVault));
        (uint256 aliceCompFee, uint256 aliceCompProfit) = _exit(ALICE, address(compoundVault));
        (uint256 bobAaveFee, uint256 bobAaveProfit) = _exit(BOB, address(aaveVault));
        (uint256 bobCompFee, uint256 bobCompProfit) = _exit(BOB, address(compoundVault));
        _near(_feeBpsx100(aliceAaveFee, aliceAaveProfit), 1000_00, 2_00, "Aave: 10% without staking");
        _near(_feeBpsx100(aliceCompFee, aliceCompProfit), 1000_00, 2_00, "Compound: 10% without staking");
        _near(_feeBpsx100(bobAaveFee, bobAaveProfit), 250_00, 2_00, "Aave: 2.5% at the top tier");
        _near(_feeBpsx100(bobCompFee, bobCompProfit), 250_00, 2_00, "Compound: 2.5% at the top tier");
        require(_usdc(ALICE) > before[0] && _usdc(BOB) > before[1], "both depositors earned yield");
    }

    function testVaultsKeepSeparateBooks() public {
        vm.prank(ALICE);
        aaveVault.deposit(1_000e6);
        require(compoundVault.totalAssets() == 0 && compoundVault.totalShares() == 0, "Compound untouched");
        vm.prank(BOB);
        compoundVault.deposit(2_000e6);
        _near(aaveVault.totalAssets(), 1_000e6, 2, "Aave holds only its own deposit");
    }

    function testAdminControlsBothVaultsTheSameWay() public {
        vm.startPrank(ALICE);
        aaveVault.deposit(1_000e6);
        compoundVault.deposit(1_000e6);
        vm.stopPrank();
        vm.startPrank(ADMIN);
        aaveVault.setPaused(true);
        compoundVault.setPaused(true);
        aaveVault.emergencyWithdrawFromAave(type(uint256).max);
        compoundVault.emergencyWithdrawFromComet(type(uint256).max);
        vm.stopPrank();
        require(ForkToken(AUSDC).balanceOf(address(aaveVault)) <= 2, "Aave position recovered");
        require(IComet(COMET).balanceOf(address(compoundVault)) <= 2, "Comet position recovered");
        uint256 before = _usdc(ALICE);
        vm.startPrank(ALICE);
        aaveVault.withdraw(aaveVault.sharesOf(ALICE));
        compoundVault.withdraw(compoundVault.sharesOf(ALICE));
        vm.stopPrank();
        require(_usdc(ALICE) - before + 4 >= 2_000e6, "paused vaults still pay out in full");
    }

    function testSuiteRouterTakesRealFlashLoansAndRefusesLosses() public {
        vm.prank(ADMIN);
        vm.expectRevert(bytes("Insufficient profit: Anti-loss guard triggered"));
        router.requestFlashLoan(USDC, 1_000e6, abi.encode(uint256(0)));
        vm.prank(ALICE);
        vm.expectRevert(bytes("Not authorized"));
        router.requestFlashLoan(USDC, 1_000e6, abi.encode(uint256(0)));
    }

    function _usdc(address who) internal view returns (uint256) {
        return ForkToken(USDC).balanceOf(who);
    }

    function _exit(address who, address vault) internal returns (uint256 fee, uint256 profit) {
        uint256 before = _usdc(who);
        uint256 treasuryBefore = _usdc(ADMIN);
        uint256 shares = YieldStakingVault(vault).sharesOf(who);
        vm.prank(who);
        YieldStakingVault(vault).withdraw(shares);
        fee = _usdc(ADMIN) - treasuryBefore;
        profit = _usdc(who) - before + fee - 5_000e6;
    }
}
