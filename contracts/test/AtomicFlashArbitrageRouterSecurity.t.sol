// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AtomicFlashArbitrageRouter} from "../src/AtomicFlashArbitrageRouter.sol";
import {
    TestBase,
    MockERC20,
    MockAavePool,
    MockUniswapV2Router
} from "./AtomicFlashArbitrageRouter.t.sol";

/// Access-control and trust-boundary tests from the line-by-line review (see audit/ROUTER-REVIEW.md).
contract AtomicFlashArbitrageRouterSecurityTest is TestBase {
    MockAavePool pool;
    MockERC20 usdc;
    MockERC20 dai;
    MockUniswapV2Router uni;
    AtomicFlashArbitrageRouter router;
    address constant ADMIN = address(0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98);
    address constant OPERATOR = address(0xABCD);
    address constant STRANGER = address(0x9999);

    function setUp() public {
        pool = new MockAavePool();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        dai = new MockERC20("Dai", "DAI", 18);
        uni = new MockUniswapV2Router();
        router = new AtomicFlashArbitrageRouter(address(pool), ADMIN);
    }

    function testCallbackRejectsStrangersAndWrongInitiator() public {
        try router.executeOperation(address(usdc), 1, 0, address(router), "") { revert("stranger called callback"); } catch {}
        // The pool itself must still name the router as initiator.
        vm.prank(address(pool));
        try router.executeOperation(address(usdc), 1, 0, STRANGER, "") { revert("foreign initiator accepted"); } catch {}
    }

    function testOnlyAdminControlsRolesPoolAndRescue() public {
        vm.prank(STRANGER);
        try router.setAdmin(STRANGER) { revert("x1"); } catch {}
        vm.prank(OPERATOR);
        try router.setOperator(OPERATOR, true) { revert("x2"); } catch {}
        vm.prank(STRANGER);
        try router.setAavePool(STRANGER) { revert("x3"); } catch {}
        vm.prank(STRANGER);
        try router.rescueTokens(address(usdc), STRANGER, 1) { revert("x4"); } catch {}
        vm.prank(STRANGER);
        try router.withdrawProfit(address(usdc), STRANGER, 1) { revert("x5"); } catch {}
        vm.prank(STRANGER);
        try router.rescueETH(payable(STRANGER), 1) { revert("x6"); } catch {}
        vm.prank(ADMIN);
        try router.setOperator(address(0), true) { revert("zero operator"); } catch {}
        vm.prank(ADMIN);
        try router.setAavePool(address(0)) { revert("zero pool"); } catch {}
    }

    function testAdminRescueEthAndRevokedOperatorLosesAccess() public {
        vm.deal(address(router), 1 ether);
        address payable sink = payable(address(0x51C1));
        vm.prank(ADMIN);
        router.rescueETH(sink, 1 ether);
        require(sink.balance == 1 ether, "eth rescued");

        vm.prank(ADMIN);
        router.setOperator(OPERATOR, true);
        vm.prank(ADMIN);
        router.setOperator(OPERATOR, false);
        vm.prank(OPERATOR);
        try router.requestFlashLoan(address(usdc), 1, "") { revert("revoked operator still authorised"); } catch {}
    }

    // ---- Known issues, characterised (audit/KNOWN-ISSUES.md KI-R*) ----

    /// KI-R1: the deployer is an operator from the constructor; nothing in the contract forces its removal.
    function testKnownIssueDeployerIsOperatorFromConstructor() public view {
        require(router.isOperator(address(this)), "deployer is an operator");
        require(!router.isOperator(ADMIN), "admin is not itself an operator");
    }

    /// KI-R2: an operator can use generic steps to move ANY token the router holds. The router should
    /// hold no balances between runs; the profit guard only protects the borrowed asset.
    function testKnownIssueOperatorCanMoveOtherTokensHeldByRouter() public {
        dai.mint(address(router), 1_000 ether);
        uint256 borrow = 5_000 * 10 ** 6;
        uint256 premium = (borrow * 5) / 10_000;
        uni.setProfitBonus(premium); // lets the borrowed-asset guard pass with zero profit

        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(usdc);
        AtomicFlashArbitrageRouter.SwapStep[] memory steps = new AtomicFlashArbitrageRouter.SwapStep[](2);
        steps[0] = AtomicFlashArbitrageRouter.SwapStep(
            address(dai), address(0), 0, abi.encodeWithSelector(MockERC20.transfer.selector, OPERATOR, 1_000 ether)
        );
        steps[1] = AtomicFlashArbitrageRouter.SwapStep(
            address(uni), address(usdc), borrow,
            abi.encodeWithSelector(MockUniswapV2Router.swapExactTokensForTokens.selector, borrow, 0, path, address(router), block.timestamp + 600)
        );
        vm.prank(ADMIN);
        router.setOperator(OPERATOR, true);
        vm.prank(OPERATOR);
        router.executeGenericArbitrage(address(usdc), borrow, 0, OPERATOR, steps);
        require(dai.balanceOf(OPERATOR) == 1_000 ether, "operator took the router's DAI");
    }

    /// KI-R3: any pre-existing balance of the borrowed asset is counted as profit and paid to the recipient.
    function testKnownIssueExistingBalanceIsPaidOutAsProfit() public {
        usdc.mint(address(router), 100 * 10 ** 6); // stray funds already in the router
        uint256 borrow = 5_000 * 10 ** 6;
        uint256 premium = (borrow * 5) / 10_000; // 2.5 USDC
        uint256 before = usdc.balanceOf(ADMIN);
        vm.prank(ADMIN);
        router.requestFlashLoan(address(usdc), borrow, abi.encode(uint256(0)));
        require(usdc.balanceOf(ADMIN) - before == 100 * 10 ** 6 - premium, "stray balance minus premium paid out as profit");
    }

    /// Anti-loss guard: with nothing in the router and no profit, the loan cannot be repaid and the call reverts.
    function testFlashLoanWithoutProfitReverts() public {
        vm.prank(ADMIN);
        try router.requestFlashLoan(address(usdc), 5_000 * 10 ** 6, abi.encode(uint256(0))) { revert("unprofitable loan succeeded"); } catch {}
    }
}
