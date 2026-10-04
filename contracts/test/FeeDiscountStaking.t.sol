// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {GovernanceToken} from "../src/GovernanceToken.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";

interface FdVm { function prank(address) external; function warp(uint256) external; }

contract FeeDiscountStakingTest {
    FdVm constant vm = FdVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    GovernanceToken token;
    FeeDiscountStaking staking;
    address constant USER = address(0xA11CE);
    address constant EVE = address(0xE7E);

    function setUp() public {
        token = new GovernanceToken("Stake", "STK", address(this), address(this), 10_000_000 ether);
        staking = new FeeDiscountStaking(address(token), address(this), address(this));
        FeeDiscountStaking.Tier[] memory t = new FeeDiscountStaking.Tier[](2);
        t[0] = FeeDiscountStaking.Tier(10_000 ether, 500);
        t[1] = FeeDiscountStaking.Tier(50_000 ether, 1000);
        staking.setTiers(t);
        token.transfer(USER, 100_000 ether);
        vm.prank(USER);
        token.approve(address(staking), type(uint256).max);
    }

    function _stake(uint256 a) internal {
        vm.prank(USER);
        staking.stake(a);
    }

    function testTierBoundaries() public {
        require(staking.getTier(USER) == 0, "none");
        _stake(9_999 ether);
        require(staking.getTier(USER) == 0, "below tier 1");
        _stake(1 ether);
        require(staking.getTier(USER) == 500, "tier 1 exact");
        _stake(40_000 ether);
        require(staking.getTier(USER) == 1000, "tier 2 exact");
    }

    function testUnstakeRespectsLockAndFee() public {
        staking.setMinimumStakePeriod(7 days);
        staking.setWithdrawalFee(100);
        _stake(1_000 ether);
        vm.prank(USER);
        try staking.unstake(1 ether) { revert("unlocked early"); } catch {}
        vm.warp(block.timestamp + 7 days);
        uint256 before = token.balanceOf(USER);
        vm.prank(USER);
        staking.unstake(1_000 ether);
        require(token.balanceOf(USER) - before == 990 ether, "1% fee");
        require(staking.stakedBalance(USER) == 0, "cleared");
    }

    function testRestakeResetsLockForWholePosition() public {
        staking.setMinimumStakePeriod(7 days);
        _stake(1_000 ether);
        vm.warp(block.timestamp + 6 days);
        _stake(1 ether);
        vm.warp(block.timestamp + 2 days);
        vm.prank(USER);
        try staking.unstake(1 ether) { revert("lock should have reset"); } catch {}
    }

    function testOnlyAdminAndBounds() public {
        vm.prank(EVE);
        try staking.setWithdrawalFee(1) { revert("x"); } catch {}
        vm.prank(EVE);
        try staking.setMinimumStakePeriod(1) { revert("x"); } catch {}
        vm.prank(EVE);
        try staking.setAdmin(EVE) { revert("x"); } catch {}
        vm.prank(EVE);
        try staking.setTierAdmin(EVE) { revert("x"); } catch {}
        FeeDiscountStaking.Tier[] memory none = new FeeDiscountStaking.Tier[](0);
        vm.prank(EVE);
        try staking.setTiers(none) { revert("x"); } catch {}
        try staking.setWithdrawalFee(5001) { revert("fee cap"); } catch {}
        try staking.setAdmin(address(0)) { revert("zero"); } catch {}
    }

    function testFuzzStakeUnstakeNeverOverpays(uint88 amount, uint16 feeBps) public {
        uint256 a = (uint256(amount) % 100_000 ether) + 1;
        staking.setWithdrawalFee(uint16(uint256(feeBps) % 5001));
        _stake(a);
        uint256 before = token.balanceOf(USER);
        vm.prank(USER);
        staking.unstake(a);
        require(token.balanceOf(USER) - before <= a, "overpaid");
    }

    // ---- Known issues, characterised so reviewers can reproduce them (see audit/KNOWN-ISSUES.md) ----

    /// KI-S1: admin can brick every unstake; a period near uint256 max overflows the lock check.
    function testKnownIssueAdminCanLockAllStakersForever() public {
        _stake(1_000 ether);
        staking.setMinimumStakePeriod(type(uint256).max);
        vm.warp(block.timestamp + 3650 days);
        vm.prank(USER);
        try staking.unstake(1_000 ether) { revert("expected permanent lock"); } catch {}
    }

    /// KI-S2: the withdrawal fee (up to 50%) applies to existing positions, and collected fees have no sweep function.
    function testKnownIssueRetroactiveFeeAndStuckFees() public {
        _stake(1_000 ether);
        staking.setWithdrawalFee(5000);
        vm.prank(USER);
        staking.unstake(1_000 ether);
        require(token.balanceOf(address(staking)) == 500 ether, "half of the position stays in the contract");
        require(staking.stakedBalance(USER) == 0, "position cleared; the retained fee is unaccounted");
    }

    /// KI-S3: getTier assumes ascending tiers; unsorted tiers silently reduce discounts.
    function testKnownIssueUnsortedTiersLowerDiscount() public {
        FeeDiscountStaking.Tier[] memory t = new FeeDiscountStaking.Tier[](2);
        t[0] = FeeDiscountStaking.Tier(50_000 ether, 1000);
        t[1] = FeeDiscountStaking.Tier(10_000 ether, 500);
        staking.setTiers(t);
        _stake(60_000 ether);
        require(staking.getTier(USER) == 500, "expected the lower discount from unsorted tiers");
    }
}
