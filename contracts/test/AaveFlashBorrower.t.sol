// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AaveFlashBorrower} from "../src/AaveFlashBorrower.sol";
import {BaseForkSupport, ForkToken} from "./BaseForkSupport.sol";

interface AavePoolPremium {
    function FLASHLOAN_PREMIUM_TOTAL() external view returns (uint128);
}

/// The older flash borrower against real Base Aave v3 flash loans.
contract AaveFlashBorrowerTest is BaseForkSupport {
    address internal constant ADMIN = address(0xAD317);
    address internal constant STRANGER = address(0x9999);
    uint256 internal constant LOAN = 10_000e6;

    AaveFlashBorrower internal borrower;
    uint256 internal premium;

    function setUp() public {
        _fork();
        borrower = new AaveFlashBorrower(AAVE_POOL, ADMIN);
        uint256 bps = AavePoolPremium(AAVE_POOL).FLASHLOAN_PREMIUM_TOTAL();
        premium = (LOAN * bps + 5_000) / 10_000; // Aave's percentMul rounds half up
        _buyUsdc(address(this), 2 ether);
    }

    function _usdc(address who) internal view returns (uint256) {
        return ForkToken(USDC).balanceOf(who);
    }

    function testConstructorSetsAdminAndPool() public view {
        require(borrower.aavePool() == AAVE_POOL && borrower.admin() == ADMIN, "constructor state");
    }

    function testConstructorRejectsZeroAddresses() public {
        try new AaveFlashBorrower(address(0), ADMIN) { revert("zero pool"); } catch {}
        try new AaveFlashBorrower(AAVE_POOL, address(0)) { revert("zero admin"); } catch {}
    }

    function testRealFlashLoanSucceedsWhenPrefundedForThePremium() public {
        ForkToken(USDC).transfer(address(borrower), premium + 1e6);
        vm.prank(ADMIN);
        borrower.requestFlashLoan(USDC, LOAN, abi.encode(uint256(1e6)));
        require(_usdc(address(borrower)) == 1e6, "kept the surplus after repaying Aave's premium");
    }

    function testRealFlashLoanRevertsWithoutFundsForPremium() public {
        vm.prank(ADMIN);
        try borrower.requestFlashLoan(USDC, LOAN, "") { revert("unfunded loan succeeded"); } catch {}
    }

    function testMinimumProfitIsEnforced() public {
        ForkToken(USDC).transfer(address(borrower), premium + 500_000);
        vm.prank(ADMIN);
        try borrower.requestFlashLoan(USDC, LOAN, abi.encode(uint256(1e6))) { revert("profit target ignored"); } catch {}
    }

    function testOnlyAdminCanRequestAndConfigure() public {
        vm.startPrank(STRANGER);
        try borrower.requestFlashLoan(USDC, LOAN, "") { revert("x1"); } catch {}
        try borrower.setAdmin(STRANGER) { revert("x2"); } catch {}
        try borrower.setAavePool(STRANGER) { revert("x3"); } catch {}
        try borrower.withdrawProfit(USDC, STRANGER, 1) { revert("x4"); } catch {}
        vm.stopPrank();
        vm.startPrank(ADMIN);
        try borrower.requestFlashLoan(USDC, 0, "") { revert("zero amount"); } catch {}
        try borrower.setAdmin(address(0)) { revert("zero admin"); } catch {}
        try borrower.setAavePool(address(0)) { revert("zero pool"); } catch {}
        vm.stopPrank();
    }

    function testCallbackRejectsStrangersAndForeignInitiators() public {
        try borrower.executeOperation(USDC, 1, 0, address(borrower), "") { revert("stranger callback"); } catch {}
        vm.prank(AAVE_POOL);
        try borrower.executeOperation(USDC, 1, 0, STRANGER, "") { revert("foreign initiator"); } catch {}
    }

    function testAdminCanRotateAndWithdraw() public {
        ForkToken(USDC).transfer(address(borrower), 5e6);
        vm.startPrank(ADMIN);
        borrower.withdrawProfit(USDC, ADMIN, 5e6);
        require(_usdc(ADMIN) == 5e6, "withdrawn");
        borrower.setAavePool(address(0x1234));
        require(borrower.aavePool() == address(0x1234), "pool rotated");
        try borrower.withdrawProfit(USDC, address(0), 1) { revert("zero recipient"); } catch {}
        try borrower.withdrawProfit(USDC, ADMIN, 0) { revert("zero amount"); } catch {}
        vm.stopPrank();
    }
}
