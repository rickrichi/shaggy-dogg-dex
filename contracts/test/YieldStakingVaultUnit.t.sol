// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {GovernanceToken} from "../src/GovernanceToken.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";
import {YieldStakingVault} from "../src/YieldStakingVault.sol";

interface YvVm { function prank(address) external; }

/// Minimal Aave-like pool that is also its own aToken (balanceOf = supplied balance).
contract MockPool {
    GovernanceToken public immutable asset;
    mapping(address => uint256) public balanceOf;
    constructor(GovernanceToken a) { asset = a; }
    function supply(address, uint256 amount, address onBehalfOf, uint16) external {
        require(asset.transferFrom(msg.sender, address(this), amount), "pull");
        balanceOf[onBehalfOf] += amount;
    }
    function withdraw(address, uint256 amount, address to) external returns (uint256) {
        balanceOf[msg.sender] -= amount;
        require(asset.transfer(to, amount), "push");
        return amount;
    }
    /// Simulates Aave interest: more underlying arrives and the supplier's aToken balance grows.
    function accrue(address supplier, uint256 amount) external {
        balanceOf[supplier] += amount;
    }
}

/// Stands in for an attacker-chosen pool: it accepts and keeps deposits.
contract EvilPool {
    GovernanceToken public immutable asset;
    constructor(GovernanceToken a) { asset = a; }
    /// Uses the approval the vault grants before supply(), exactly as a hostile pool would.
    function supply(address, uint256 amount, address, uint16) external {
        require(asset.transferFrom(msg.sender, address(this), amount), "pull");
    }
    function withdraw(address, uint256, address) external pure returns (uint256) { return 0; }
    function balanceOf(address) external pure returns (uint256) { return 0; }
}

contract YieldStakingVaultUnitTest {
    YvVm constant vm = YvVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    GovernanceToken usdc;      // 18-decimal stand-in; vault logic is decimals-agnostic
    GovernanceToken amutt;
    FeeDiscountStaking staking;
    MockPool pool;
    YieldStakingVault vault;
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
        pool = new MockPool(usdc);
        vault = new YieldStakingVault(address(usdc), address(pool), address(pool), address(staking), address(this), TREASURY);
        _fund(ALICE, 1_000_000 ether);
        _fund(BOB, 1_000_000 ether);
    }

    function _near(uint256 a, uint256 b, uint256 tol, string memory why) internal pure {
        require(a + tol >= b && b + tol >= a, why);
    }

    function _fund(address who, uint256 amount) internal {
        usdc.transfer(who, amount);
        vm.prank(who);
        usdc.approve(address(vault), type(uint256).max);
    }
    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(amount);
    }
    function _yield(uint256 amount) internal {
        usdc.transfer(address(pool), amount);   // backing assets for the interest
        pool.accrue(address(vault), amount);
    }

    function testRoundTripWithoutYieldChargesNoFee() public {
        uint256 shares = _deposit(ALICE, 1_000 ether);
        require(shares == 1_000 ether * 1e6 && vault.totalAssets() == 1_000 ether, "first deposit mints asset*1e6 shares");
        uint256 before = usdc.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw(shares);
        require(usdc.balanceOf(ALICE) - before == 1_000 ether, "full principal back");
        require(usdc.balanceOf(TREASURY) == 0 && vault.totalShares() == 0, "no fee, no shares");
    }

    function testYieldFeeWithAndWithoutStakingDiscount() public {
        uint256 shares = _deposit(ALICE, 1_000 ether);
        _yield(100 ether);
        vm.prank(ALICE);
        vault.withdraw(shares);
        _near(usdc.balanceOf(TREASURY), 10 ether, 10, "10% of 100 yield");

        // Bob stakes into the 5% discount tier: fee becomes 9.5% of yield.
        amutt.transfer(BOB, 10_000 ether);
        vm.prank(BOB);
        amutt.approve(address(staking), type(uint256).max);
        vm.prank(BOB);
        staking.stake(10_000 ether);
        uint256 bobShares = _deposit(BOB, 1_000 ether);
        _yield(100 ether);
        uint256 feeBefore = usdc.balanceOf(TREASURY);
        vm.prank(BOB);
        vault.withdraw(bobShares);
        _near(usdc.balanceOf(TREASURY) - feeBefore, 9.5 ether, 10, "9.5% with 5% discount");
    }

    function testSharesAreProRataAcrossDepositors() public {
        uint256 a = _deposit(ALICE, 1_000 ether);
        _yield(1_000 ether);
        uint256 b = _deposit(BOB, 2_000 ether);
        _near(b, a, a / 1e12, "2000 buys in at the doubled price: the same share count as the first 1000");
    }

    function testZeroAndOverdrawRevert() public {
        try vault.deposit(0) { revert("zero deposit"); } catch {}
        uint256 owned = _deposit(ALICE, 10 ether);
        vm.prank(ALICE);
        try vault.withdraw(owned + 1) { revert("overdraw"); } catch {}
        vm.prank(BOB);
        try vault.withdraw(1) { revert("no shares"); } catch {}
    }

    function testAdminOnlySettersAndFeeCap() public {
        vm.prank(EVE); try vault.setAdmin(EVE) { revert("x"); } catch {}
        vm.prank(EVE); try vault.setTreasury(EVE) { revert("x"); } catch {}
        vm.prank(EVE); try vault.setPerformanceFee(1) { revert("x"); } catch {}
        vm.prank(EVE); try vault.setAavePoolAndAToken(EVE, EVE) { revert("x"); } catch {}
        try vault.setPerformanceFee(3001) { revert("fee cap"); } catch {}
        try vault.setTreasury(address(0)) { revert("zero treasury"); } catch {}
        vault.setPerformanceFee(3000);
        require(vault.performanceFeeBps() == 3000, "set");
    }

    function testFuzzWithdrawNeverExceedsAssets(uint88 dep, uint88 gain) public {
        uint256 d = (uint256(dep) % 500_000 ether) + 1 ether;
        uint256 g = uint256(gain) % 100_000 ether;
        uint256 shares = _deposit(ALICE, d);
        if (g > 0) _yield(g);
        uint256 before = usdc.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw(shares);
        uint256 got = usdc.balanceOf(ALICE) - before;
        require(got <= d + g && got >= d, "payout between principal and principal+yield");
    }

    // ---- Known issues, characterised so reviewers can reproduce them (see audit/KNOWN-ISSUES.md) ----

    /// Regression for the former KI-V1: with virtual shares a donation attack loses money for the attacker
    /// and does not hurt the victim.
    function testDonationAttackIsUnprofitable() public {
        uint256 aliceCost = 1 + 10_000 ether;
        _deposit(ALICE, 1);
        vm.prank(ALICE);
        usdc.transfer(address(vault), 10_000 ether);
        uint256 victimShares = _deposit(BOB, 15_000 ether);
        require(victimShares > 1_000_000, "victim receives a meaningful share count");
        uint256 aliceBefore = usdc.balanceOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw(1e6);
        require(usdc.balanceOf(ALICE) - aliceBefore < aliceCost, "attacker loses money");
        uint256 bobBefore = usdc.balanceOf(BOB);
        vm.prank(BOB);
        vault.withdraw(victimShares);
        require(usdc.balanceOf(BOB) - bobBefore >= 15_000 ether - 0.01 ether, "victim loses at most a rounding amount (<0.01)");
    }

    /// A tiny deposit against a donated vault is rejected outright instead of silently donating funds.
    function testTinyDepositAfterDonationReverts() public {
        _deposit(ALICE, 1);
        vm.prank(ALICE);
        usdc.transfer(address(vault), 10_000 ether);
        vm.prank(BOB);
        try vault.deposit(1) { revert("expected zero-share revert"); } catch {}
    }

    /// KI-V2: the admin can repoint the vault at an arbitrary pool; later deposits are approved and sent to it.
    function testKnownIssueAdminCanRedirectDepositsToArbitraryPool() public {
        EvilPool evil = new EvilPool(usdc);
        vault.setAavePoolAndAToken(address(evil), address(evil));
        _deposit(ALICE, 1_000 ether);
        require(usdc.balanceOf(address(evil)) == 1_000 ether, "funds sit in the admin-chosen pool");
        require(vault.totalAssets() == 0, "vault accounting no longer sees them");
    }

    /// KI-V3: repointing away from a pool that still holds funds hides them from totalAssets.
    function testKnownIssueRepointingHidesExistingFunds() public {
        _deposit(ALICE, 1_000 ether);
        vault.setAavePoolAndAToken(address(0), address(0));
        require(vault.totalAssets() == 0, "assets in the old pool are invisible after repointing");
    }
}
