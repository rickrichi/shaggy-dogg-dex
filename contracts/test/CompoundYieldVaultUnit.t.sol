// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {GovernanceToken} from "../src/GovernanceToken.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";
import {CompoundYieldVault} from "../src/CompoundYieldVault.sol";

interface CvVm { function prank(address) external; }

/// Minimal Compound v3 Comet: base-asset supply/withdraw with an internal balance.
contract MockComet {
    GovernanceToken public immutable asset;
    mapping(address => uint256) public balanceOf;
    constructor(GovernanceToken a) { asset = a; }
    function supply(address, uint256 amount) external {
        require(asset.transferFrom(msg.sender, address(this), amount), "pull");
        balanceOf[msg.sender] += amount;
    }
    function withdraw(address, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        require(asset.transfer(msg.sender, amount), "push");
    }
    function accrue(address supplier, uint256 amount) external { balanceOf[supplier] += amount; }
}

contract EvilComet {
    GovernanceToken public immutable asset;
    constructor(GovernanceToken a) { asset = a; }
    function supply(address, uint256 amount) external { require(asset.transferFrom(msg.sender, address(this), amount), "pull"); }
    function withdraw(address, uint256) external pure {}
    function balanceOf(address) external pure returns (uint256) { return 0; }
}

contract CompoundYieldVaultUnitTest {
    CvVm constant vm = CvVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    GovernanceToken usdc;
    GovernanceToken amutt;
    FeeDiscountStaking staking;
    MockComet comet;
    CompoundYieldVault vault;
    address constant TREASURY = address(0x7EA5);
    address constant ALICE = address(0xA11CE);
    address constant BOB = address(0xB0B);
    address constant EVE = address(0xE7E);

    function setUp() public {
        usdc = new GovernanceToken("USD", "USD", address(this), address(this), 1e30);
        amutt = new GovernanceToken("AM", "AM", address(this), address(this), 1e30);
        staking = new FeeDiscountStaking(address(amutt), address(this), address(this));
        FeeDiscountStaking.Tier[] memory t = new FeeDiscountStaking.Tier[](1);
        t[0] = FeeDiscountStaking.Tier(10_000 ether, 500);
        staking.setTiers(t);
        comet = new MockComet(usdc);
        vault = new CompoundYieldVault(address(usdc), address(comet), address(staking), address(this), TREASURY);
        _fund(ALICE);
        _fund(BOB);
    }

    function _fund(address who) internal {
        usdc.transfer(who, 1_000_000 ether);
        vm.prank(who);
        usdc.approve(address(vault), type(uint256).max);
    }
    function _deposit(address who, uint256 amount) internal returns (uint256 s) { vm.prank(who); s = vault.deposit(amount); }
    function _yield(uint256 amount) internal { usdc.transfer(address(comet), amount); comet.accrue(address(vault), amount); }
    function _near(uint256 a, uint256 b, uint256 tol, string memory why) internal pure { require(a + tol >= b && b + tol >= a, why); }

    function testRoundTripWithoutYieldChargesNoFee() public {
        uint256 shares = _deposit(ALICE, 1_000 ether);
        require(vault.totalAssets() == 1_000 ether, "assets supplied to comet");
        uint256 before = usdc.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw(shares);
        require(usdc.balanceOf(ALICE) - before == 1_000 ether && usdc.balanceOf(TREASURY) == 0, "principal back");
        require(vault.totalShares() == 0, "no shares left");
    }

    function testYieldFeeWithAndWithoutDiscount() public {
        uint256 s = _deposit(ALICE, 1_000 ether);
        _yield(100 ether);
        vm.prank(ALICE);
        vault.withdraw(s);
        _near(usdc.balanceOf(TREASURY), 10 ether, 10, "10% fee");

        amutt.transfer(BOB, 10_000 ether);
        vm.prank(BOB);
        amutt.approve(address(staking), type(uint256).max);
        vm.prank(BOB);
        staking.stake(10_000 ether);
        uint256 bs = _deposit(BOB, 1_000 ether);
        _yield(100 ether);
        uint256 feeBefore = usdc.balanceOf(TREASURY);
        vm.prank(BOB);
        vault.withdraw(bs);
        _near(usdc.balanceOf(TREASURY) - feeBefore, 9.5 ether, 10, "9.5% with the 5% tier");
    }

    function testWithdrawPullsFromCometOnlyWhenNeeded() public {
        uint256 s = _deposit(ALICE, 500 ether);
        require(usdc.balanceOf(address(vault)) == 0, "all supplied");
        vm.prank(ALICE);
        vault.withdraw(s / 2);
        require(vault.totalAssets() > 249 ether && vault.totalAssets() < 251 ether, "half remains");
    }

    function testGuardsAndAdminControls() public {
        try vault.deposit(0) { revert("zero deposit"); } catch {}
        uint256 owned = _deposit(ALICE, 10 ether);
        vm.prank(ALICE);
        try vault.withdraw(owned + 1) { revert("overdraw"); } catch {}
        vm.prank(BOB);
        try vault.withdraw(1) { revert("no shares"); } catch {}
        vm.prank(EVE); try vault.setAdmin(EVE) { revert("x1"); } catch {}
        vm.prank(EVE); try vault.setTreasury(EVE) { revert("x2"); } catch {}
        vm.prank(EVE); try vault.setPerformanceFee(1) { revert("x3"); } catch {}
        vm.prank(EVE); try vault.setComet(EVE) { revert("x4"); } catch {}
        try vault.setPerformanceFee(3001) { revert("fee cap"); } catch {}
        try vault.setTreasury(address(0)) { revert("zero treasury"); } catch {}
        try vault.setAdmin(address(0)) { revert("zero admin"); } catch {}
    }

    function testConstructorRejectsZeroRoles() public {
        try new CompoundYieldVault(address(0), address(comet), address(staking), address(this), TREASURY) { revert("a"); } catch {}
        try new CompoundYieldVault(address(usdc), address(comet), address(staking), address(0), TREASURY) { revert("b"); } catch {}
        try new CompoundYieldVault(address(usdc), address(comet), address(staking), address(this), address(0)) { revert("c"); } catch {}
    }

    function testFuzzPayoutBoundedByPrincipalAndYield(uint88 dep, uint88 gain) public {
        uint256 d = (uint256(dep) % 500_000 ether) + 1 ether;
        uint256 g = uint256(gain) % 100_000 ether;
        uint256 s = _deposit(ALICE, d);
        if (g > 0) _yield(g);
        uint256 before = usdc.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw(s);
        uint256 got = usdc.balanceOf(ALICE) - before;
        require(got <= d + g && got >= d, "payout in [principal, principal+yield]");
    }

    function testDonationAttackIsUnprofitable() public {
        _deposit(ALICE, 1);
        vm.prank(ALICE);
        usdc.transfer(address(vault), 10_000 ether);
        uint256 victimShares = _deposit(BOB, 15_000 ether);
        require(victimShares > 1_000_000, "victim gets meaningful shares");
        uint256 aBefore = usdc.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw(1e6);
        require(usdc.balanceOf(ALICE) - aBefore < 10_000 ether + 1, "attacker loses money");
        uint256 bBefore = usdc.balanceOf(BOB);
        vm.prank(BOB);
        vault.withdraw(victimShares);
        require(usdc.balanceOf(BOB) - bBefore >= 15_000 ether - 0.01 ether, "victim loses only rounding");
    }

    // ---- Known issue (same class as the Aave vault KI-V2/V3) ----
    function testKnownIssueAdminCanRedirectDepositsToArbitraryComet() public {
        EvilComet evil = new EvilComet(usdc);
        vault.setComet(address(evil));
        _deposit(ALICE, 1_000 ether);
        require(usdc.balanceOf(address(evil)) == 1_000 ether && vault.totalAssets() == 0, "funds sit in the admin-chosen comet");
    }
}
