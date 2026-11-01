// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/FixedSupplyToken.sol";
import "../src/LaunchpadSuiteDeployer.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes calldata) external;
}

contract LaunchpadSuiteDeployerTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "uint mismatch");
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "address mismatch");
    }

    function assertFalse(bool value) internal pure {
        require(!value, "expected false");
    }

    address constant ADMIN = address(0xA);
    address constant STAKER = address(0xB);
    address constant OTHER = address(0xC);
    address constant ASSET = address(0x1);
    address constant POOL = address(0x2);

    FixedSupplyToken token;

    function setUp() public {
        token = new FixedSupplyToken("T", "T", STAKER, 1_000_000e18);
    }

    function config(bool aave, bool full) internal view returns (LaunchpadSuiteDeployer.Config memory c) {
        c.token = address(token);
        c.admin = ADMIN;
        c.lockSeconds = 7 days;
        c.unstakeFeeBps = 250;
        c.performanceFeeBps = 1500;
        c.tiers = new FeeDiscountStaking.Tier[](2);
        c.tiers[0] = FeeDiscountStaking.Tier(100e18, 100);
        c.tiers[1] = FeeDiscountStaking.Tier(1_000e18, 1000);
        c.deployAaveVault = aave;
        c.deployFullSuite = full;
        c.usdc = ASSET;
        c.aavePool = POOL;
        c.aUsdc = address(0x3);
        c.comet = address(0x4);
    }

    function stakeAndExit(FeeDiscountStaking staking, uint256 amount) internal {
        vm.startPrank(STAKER);
        token.approve(address(staking), amount);
        staking.stake(amount);
        vm.warp(block.timestamp + 7 days);
        staking.unstake(amount);
        vm.stopPrank();
    }

    function testStakingOnlyAppliesSettingsAndKeepsNoPrivileges() public {
        LaunchpadSuiteDeployer d = new LaunchpadSuiteDeployer(config(false, false));
        FeeDiscountStaking s = FeeDiscountStaking(d.staking());
        assertEq(s.minimumStakePeriod(), 7 days);
        assertEq(s.withdrawalFeeBps(), 250);
        assertEq(s.tiersLength(), 2);
        assertEq(s.admin(), ADMIN);
        assertEq(s.tierAdmin(), ADMIN);
        assertEq(d.aaveVault(), address(0));
        assertEq(d.compoundVault(), address(0));
        assertEq(d.arbitrageRouter(), address(0));
    }

    function testFullSuiteHandsEverythingToAdmin() public {
        LaunchpadSuiteDeployer d = new LaunchpadSuiteDeployer(config(false, true));
        YieldStakingVault aave = YieldStakingVault(d.aaveVault());
        CompoundYieldVault comp = CompoundYieldVault(d.compoundVault());
        AtomicFlashArbitrageRouter router = AtomicFlashArbitrageRouter(payable(d.arbitrageRouter()));
        assertEq(aave.performanceFeeBps(), 1500);
        assertEq(comp.performanceFeeBps(), 1500);
        assertEq(aave.admin(), ADMIN);
        assertEq(comp.admin(), ADMIN);
        assertEq(aave.treasury(), ADMIN);
        assertEq(comp.treasury(), ADMIN);
        assertEq(address(aave.discountStaking()), d.staking());
        assertEq(router.admin(), ADMIN);
        assertFalse(router.isOperator(address(d)));
    }

    function testInvalidSettingRevertsEverything() public {
        LaunchpadSuiteDeployer.Config memory c = config(false, false);
        c.unstakeFeeBps = 5001;
        vm.expectRevert(bytes("Too high"));
        new LaunchpadSuiteDeployer(c);

        c = config(true, false);
        c.performanceFeeBps = 3001;
        vm.expectRevert(bytes("Max 30% fee"));
        new LaunchpadSuiteDeployer(c);
    }

    function testAdminWithdrawsExactlyTheCollectedFees() public {
        FeeDiscountStaking s = FeeDiscountStaking(new LaunchpadSuiteDeployer(config(false, false)).staking());
        stakeAndExit(s, 1_000e18);
        assertEq(s.accruedFees(), 25e18);

        vm.prank(ADMIN);
        s.withdrawFees(OTHER, 10e18);
        assertEq(token.balanceOf(OTHER), 10e18);
        assertEq(s.accruedFees(), 15e18);

        vm.prank(ADMIN);
        s.withdrawFees(ADMIN, 15e18);
        assertEq(token.balanceOf(ADMIN), 15e18);
        assertEq(s.accruedFees(), 0);
        assertEq(token.balanceOf(address(s)), 0);
    }

    function testFeesWithdrawalCannotTouchStakes() public {
        FeeDiscountStaking s = FeeDiscountStaking(new LaunchpadSuiteDeployer(config(false, false)).staking());
        stakeAndExit(s, 1_000e18);
        vm.startPrank(STAKER);
        token.approve(address(s), 500e18);
        s.stake(500e18);
        vm.stopPrank();

        vm.prank(ADMIN);
        vm.expectRevert(bytes("Exceeds fees"));
        s.withdrawFees(ADMIN, 25e18 + 1);

        vm.prank(ADMIN);
        s.withdrawFees(ADMIN, 25e18);

        vm.warp(block.timestamp + 7 days);
        vm.prank(STAKER);
        s.unstake(500e18); // The stake is still fully backed after the withdrawal.
        assertEq(s.accruedFees(), 12.5e18);
    }

    function testOnlyAdminWithdrawsFees() public {
        FeeDiscountStaking s = FeeDiscountStaking(new LaunchpadSuiteDeployer(config(false, false)).staking());
        stakeAndExit(s, 1_000e18);
        vm.prank(STAKER);
        vm.expectRevert(bytes("Not admin"));
        s.withdrawFees(STAKER, 1);
    }

    function testRejectsZeroAmountAndZeroRecipient() public {
        FeeDiscountStaking s = FeeDiscountStaking(new LaunchpadSuiteDeployer(config(false, false)).staking());
        stakeAndExit(s, 1_000e18);
        vm.startPrank(ADMIN);
        vm.expectRevert(bytes("Exceeds fees"));
        s.withdrawFees(ADMIN, 0);
        vm.expectRevert(bytes("Invalid"));
        s.withdrawFees(address(0), 1);
        vm.stopPrank();
    }
}
