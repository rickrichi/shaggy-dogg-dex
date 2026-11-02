// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FixedSupplyToken} from "../src/FixedSupplyToken.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";
import {BaseForkSupport, ForkToken} from "./BaseForkSupport.sol";

/// Functions both launchpad vaults share (YieldStakingVault and CompoundYieldVault).
interface ILaunchVault {
    function deposit(uint256) external returns (uint256);
    function withdraw(uint256) external returns (uint256);
    function totalAssets() external view returns (uint256);
    function totalShares() external view returns (uint256);
    function sharesOf(address) external view returns (uint256);
    function performanceFeeBps() external view returns (uint16);
    function discountDenominator() external view returns (uint256);
    function setPerformanceFee(uint16) external;
    function setPaused(bool) external;
    function paused() external view returns (bool);
    function setAdmin(address) external;
    function setTreasury(address) external;
    function admin() external view returns (address);
    function treasury() external view returns (address);
    function underlyingAsset() external view returns (address);
}

/// One behavioural suite run against both vaults on a Base fork, so the Aave and Compound cards
/// keep identical guarantees. Each vault test supplies deployment, recovery and protocol balance.
abstract contract LaunchVaultForkTests is BaseForkSupport {
    address internal constant ADMIN = address(0xAD317); // launch wallet: vault admin and treasury
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant EVE = address(0xE7E);

    FixedSupplyToken internal token;
    FeeDiscountStaking internal staking;
    ILaunchVault internal vault;

    function _deployVault(address discountStaking, address admin, address treasury) internal virtual returns (address);
    /// Calls the vault's pause-only recovery as ADMIN.
    function _recover(uint256 amount) internal virtual returns (uint256);
    function _recoverAs(address caller, uint256 amount) internal virtual;
    /// USDC the vault holds inside its lending market.
    function _protocolBalance() internal view virtual returns (uint256);
    function testConstructorRejectsZeroAddresses() public virtual;

    function setUp() public virtual {
        _fork();
        (token, staking) = _launchTokenAndStaking(ADMIN);
        vault = ILaunchVault(_deployVault(address(staking), ADMIN, ADMIN));
        for (uint256 i = 0; i < 3; i++) {
            address who = i == 0 ? ALICE : i == 1 ? BOB : EVE;
            _buyUsdc(who, 15 ether);
            vm.prank(who);
            ForkToken(USDC).approve(address(vault), type(uint256).max);
        }
    }

    function _usdc(address who) internal view returns (uint256) {
        return ForkToken(USDC).balanceOf(who);
    }

    function _deposit(address who, uint256 amount) internal returns (uint256 shares) {
        vm.prank(who);
        shares = vault.deposit(amount);
    }

    function _withdrawAll(address who) internal returns (uint256 received, uint256 fee) {
        uint256 before = _usdc(who);
        uint256 treasuryBefore = _usdc(ADMIN);
        uint256 shares = vault.sharesOf(who);
        vm.prank(who);
        vault.withdraw(shares);
        received = _usdc(who) - before;
        fee = _usdc(ADMIN) - treasuryBefore;
    }

    function testWiringMatchesTheLaunch() public view {
        require(vault.underlyingAsset() == USDC, "asset");
        require(vault.admin() == ADMIN && vault.treasury() == ADMIN, "roles");
        require(vault.discountDenominator() == 10_000, "discount scale");
        require(vault.performanceFeeBps() == 1000, "default fee");
        require(!vault.paused(), "starts unpaused");
    }

    function testDepositsAreSuppliedToTheMarketNotHeldIdle() public {
        _deposit(ALICE, 1_000e6);
        require(_protocolBalance() + 2 >= 1_000e6, "supplied to the lending market");
        require(_usdc(address(vault)) <= 1, "no idle USDC");
        require(token.balanceOf(address(vault)) == 0, "launch token is never deposited");
    }

    function testRoundTripWithoutYieldChargesNoFee() public {
        uint256 before = _usdc(ALICE);
        _deposit(ALICE, 1_000e6);
        (uint256 received, uint256 fee) = _withdrawAll(ALICE);
        require(fee == 0, "no fee without yield");
        require(received + 4 >= 1_000e6 && _usdc(ALICE) <= before, "principal back, less market rounding");
        require(vault.totalShares() == 0, "no shares left");
    }

    function testRealYieldFeeWithAndWithoutStakingDiscount() public {
        _stakeTopTier(token, staking, BOB);
        _deposit(ALICE, 10_000e6);
        _deposit(BOB, 10_000e6);
        uint256 assetsBefore = vault.totalAssets();
        vm.warp(block.timestamp + 180 days);
        require(vault.totalAssets() > assetsBefore + 50e6, "real market yield accrued");

        (uint256 aliceGot, uint256 aliceFee) = _withdrawAll(ALICE);
        (uint256 bobGot, uint256 bobFee) = _withdrawAll(BOB);
        // 10% fee for a non-staker; 75% off (2.5%) for the top tier.
        _near(_feeBpsx100(aliceFee, aliceGot + aliceFee - 10_000e6), 1000_00, 2_00, "10% of yield");
        _near(_feeBpsx100(bobFee, bobGot + bobFee - 10_000e6), 250_00, 2_00, "2.5% of yield");
        require(vault.totalShares() == 0, "vault empties");
    }

    function testPartialThenFullWithdrawal() public {
        uint256 shares = _deposit(ALICE, 2_000e6);
        vm.warp(block.timestamp + 30 days);
        vm.prank(ALICE);
        vault.withdraw(shares / 2);
        require(vault.sharesOf(ALICE) == shares - shares / 2, "half the shares remain");
        _near(vault.totalAssets(), 1_000e6, 5e6, "half the assets remain");
        _withdrawAll(ALICE);
        require(vault.totalShares() == 0 && vault.totalAssets() <= 2, "fully exited");
    }

    function testSharesAreProRataAcrossDepositors() public {
        uint256 a = _deposit(ALICE, 1_000e6);
        uint256 b = _deposit(BOB, 3_000e6);
        _near(b, a * 3, a / 1_000, "shares proportional to deposits");
    }

    function testZeroAndOverdrawRevert() public {
        vm.prank(ALICE);
        try vault.deposit(0) { revert("zero deposit accepted"); } catch {}
        uint256 owned = _deposit(ALICE, 10e6);
        vm.prank(ALICE);
        try vault.withdraw(owned + 1) { revert("overdraw accepted"); } catch {}
        vm.prank(BOB);
        try vault.withdraw(1) { revert("withdraw without shares"); } catch {}
        vm.prank(ALICE);
        try vault.withdraw(0) { revert("zero withdraw accepted"); } catch {}
    }

    function testOnlyAdminControlsAndFeeCap() public {
        vm.startPrank(EVE);
        try vault.setAdmin(EVE) { revert("x1"); } catch {}
        try vault.setTreasury(EVE) { revert("x2"); } catch {}
        try vault.setPerformanceFee(1) { revert("x3"); } catch {}
        try vault.setPaused(true) { revert("x4"); } catch {}
        vm.stopPrank();
        try this.recoverAsEve() { revert("x5"); } catch {}

        vm.startPrank(ADMIN);
        try vault.setPerformanceFee(3001) { revert("fee cap"); } catch {}
        try vault.setTreasury(address(0)) { revert("zero treasury"); } catch {}
        try vault.setAdmin(address(0)) { revert("zero admin"); } catch {}
        vault.setPerformanceFee(3000);
        vm.stopPrank();
        require(vault.performanceFeeBps() == 3000, "fee set on an empty vault");
    }

    function recoverAsEve() external {
        _recoverAs(EVE, 1);
    }

    function testFeeCannotIncreaseWhileSharesExist() public {
        _deposit(ALICE, 1_000e6);
        vm.prank(ADMIN);
        vm.expectRevert(bytes("Active fee increase"));
        vault.setPerformanceFee(1001);
        vm.prank(ADMIN);
        vault.setPerformanceFee(500);
        require(vault.performanceFeeBps() == 500, "fee can fall");
        _withdrawAll(ALICE);
        vm.prank(ADMIN);
        vault.setPerformanceFee(2000);
        require(vault.performanceFeeBps() == 2000, "higher fee once the vault is empty");
    }

    function testPauseBlocksDepositsKeepsWithdrawalsAndRecoversOnlyIntoTheVault() public {
        _deposit(ALICE, 1_000e6);
        _deposit(BOB, 1_000e6);
        vm.prank(ADMIN);
        vm.expectRevert(bytes("Not paused"));
        _recoverDirect(1e6);

        vm.prank(ADMIN);
        vault.setPaused(true);
        vm.prank(EVE);
        vm.expectRevert(bytes("Deposits paused"));
        vault.deposit(1e6);

        uint256 adminBefore = _usdc(ADMIN);
        uint256 got = _recover(400e6);
        require(got + 2 >= 400e6 && _usdc(address(vault)) + 2 >= 400e6, "partial recovery into the vault");
        _recover(type(uint256).max);
        require(_protocolBalance() <= 2, "full recovery empties the market position");
        require(_usdc(address(vault)) + 4 >= 2_000e6, "all assets now held by the vault");
        require(_usdc(ADMIN) == adminBefore, "recovery pays the admin nothing");

        (uint256 aliceGot,) = _withdrawAll(ALICE);
        require(aliceGot + 4 >= 1_000e6, "withdrawals work while paused");

        vm.prank(ADMIN);
        vault.setPaused(false);
        _deposit(EVE, 100e6);
        require(_protocolBalance() + 2 >= 100e6, "deposits resume and reach the market");
        (uint256 bobGot,) = _withdrawAll(BOB);
        require(bobGot + 4 >= 1_000e6, "remaining depositor exits in full");
    }

    /// Same recovery call without the internal prank, for expectRevert on the exact call.
    function _recoverDirect(uint256 amount) internal virtual;

    /// forge-config: default.fuzz.runs = 12
    function testFuzzPayoutBoundedByPrincipalAndYield(uint64 dep, uint32 secs) public {
        uint256 d = 1e6 + (uint256(dep) % 20_000e6);
        uint256 t = uint256(secs) % 365 days;
        _deposit(ALICE, d);
        vm.warp(block.timestamp + t);
        uint256 grown = vault.totalAssets();
        (uint256 got, uint256 fee) = _withdrawAll(ALICE);
        require(got + 4 >= d || got + fee + 4 >= grown, "principal kept, less market rounding");
        require(got + fee <= grown + 1, "never more than the vault held");
    }

    function testDonationAttackIsUnprofitable() public {
        _deposit(ALICE, 1_000); // attacker deposits 0.001 USDC
        vm.prank(ALICE);
        ForkToken(USDC).transfer(address(vault), 10_000e6); // then donates to inflate the share price
        uint256 victimShares = _deposit(BOB, 15_000e6);
        require(victimShares > 1_000_000, "victim gets meaningful shares");
        uint256 aliceBefore = _usdc(ALICE);
        uint256 attackerShares = vault.sharesOf(ALICE);
        vm.prank(ALICE);
        vault.withdraw(attackerShares);
        require(_usdc(ALICE) - aliceBefore < 10_000e6 + 1_000, "attacker loses money");
        (uint256 bobGot,) = _withdrawAll(BOB);
        require(bobGot + 10_000 >= 15_000e6, "victim loses at most 0.01 USDC");
    }

    function testTinyDepositAfterDonationReverts() public {
        _deposit(ALICE, 1_000);
        vm.prank(ALICE);
        ForkToken(USDC).transfer(address(vault), 10_000e6);
        vm.prank(BOB);
        try vault.deposit(1) { revert("dust deposit minted zero shares"); } catch {}
    }
}
