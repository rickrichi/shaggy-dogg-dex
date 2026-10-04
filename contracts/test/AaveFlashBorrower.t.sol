// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AaveFlashBorrower} from "../src/AaveFlashBorrower.sol";
import {TestBase, MockERC20, MockAavePool} from "./AtomicFlashArbitrageRouter.t.sol";

contract AaveFlashBorrowerTest is TestBase {
    MockAavePool pool;
    MockERC20 usdc;
    AaveFlashBorrower borrower;
    address constant ADMIN = address(0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98);
    address constant STRANGER = address(0x9999);
    uint256 constant LOAN = 10_000 * 10 ** 6;
    uint256 constant PREMIUM = (LOAN * 5) / 10_000; // mock pool charges 5 bps

    function setUp() public {
        pool = new MockAavePool();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        borrower = new AaveFlashBorrower(address(pool), ADMIN);
    }

    function testConstructorSetsAdminAndPool() public view {
        require(borrower.aavePool() == address(pool) && borrower.admin() == ADMIN, "constructor state");
    }

    function testConstructorRejectsZeroAddresses() public {
        try new AaveFlashBorrower(address(0), ADMIN) { revert("zero pool"); } catch {}
        try new AaveFlashBorrower(address(pool), address(0)) { revert("zero admin"); } catch {}
    }

    function testFlashLoanSucceedsWhenPrefundedForThePremium() public {
        usdc.mint(address(borrower), PREMIUM + 1_000_000);
        vm.prank(ADMIN);
        borrower.requestFlashLoan(address(usdc), LOAN, abi.encode(uint256(1_000_000)));
        require(usdc.balanceOf(address(borrower)) == 1_000_000, "profit retained after repaying premium");
    }

    function testFlashLoanRevertsWithoutFundsForPremium() public {
        vm.prank(ADMIN);
        try borrower.requestFlashLoan(address(usdc), LOAN, "") { revert("unfunded loan succeeded"); } catch {}
    }

    function testMinimumProfitIsEnforced() public {
        usdc.mint(address(borrower), PREMIUM + 500_000);
        vm.prank(ADMIN);
        try borrower.requestFlashLoan(address(usdc), LOAN, abi.encode(uint256(1_000_000))) { revert("profit target ignored"); } catch {}
    }

    function testOnlyAdminCanRequestAndConfigure() public {
        vm.prank(STRANGER);
        try borrower.requestFlashLoan(address(usdc), LOAN, "") { revert("x1"); } catch {}
        vm.prank(STRANGER);
        try borrower.setAdmin(STRANGER) { revert("x2"); } catch {}
        vm.prank(STRANGER);
        try borrower.setAavePool(STRANGER) { revert("x3"); } catch {}
        vm.prank(STRANGER);
        try borrower.withdrawProfit(address(usdc), STRANGER, 1) { revert("x4"); } catch {}
        vm.prank(ADMIN);
        try borrower.requestFlashLoan(address(usdc), 0, "") { revert("zero amount"); } catch {}
        vm.prank(ADMIN);
        try borrower.setAdmin(address(0)) { revert("zero admin"); } catch {}
        vm.prank(ADMIN);
        try borrower.setAavePool(address(0)) { revert("zero pool"); } catch {}
    }

    function testCallbackRejectsStrangersAndForeignInitiators() public {
        try borrower.executeOperation(address(usdc), 1, 0, address(borrower), "") { revert("stranger callback"); } catch {}
        vm.prank(address(pool));
        try borrower.executeOperation(address(usdc), 1, 0, STRANGER, "") { revert("foreign initiator"); } catch {}
    }

    function testAdminCanRotateAndWithdraw() public {
        usdc.mint(address(borrower), 5 * 10 ** 6);
        vm.prank(ADMIN);
        borrower.withdrawProfit(address(usdc), ADMIN, 5 * 10 ** 6);
        require(usdc.balanceOf(ADMIN) == 5 * 10 ** 6, "withdrawn");
        vm.prank(ADMIN);
        borrower.setAavePool(address(0x1234));
        require(borrower.aavePool() == address(0x1234), "pool rotated");
        vm.prank(ADMIN);
        try borrower.withdrawProfit(address(usdc), address(0), 1) { revert("zero recipient"); } catch {}
        vm.prank(ADMIN);
        try borrower.withdrawProfit(address(usdc), ADMIN, 0) { revert("zero amount"); } catch {}
    }
}
