// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AtomicFlashArbitrageRouter} from "../src/AtomicFlashArbitrageRouter.sol";
import {IERC20, IPool, Route} from "../src/Interfaces.sol";

interface Vm {
    function prank(address sender) external;
    function deal(address to, uint256 amount) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(address left, address right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertEq(uint256 left, uint256 right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertEq(string memory left, string memory right, string memory message) internal pure {
        require(keccak256(bytes(left)) == keccak256(bytes(right)), message);
    }

    function assertTrue(bool condition, string memory message) internal pure {
        require(condition, message);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// TEST MOCKS
// ──────────────────────────────────────────────────────────────────────────────

contract MockERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    uint256 private _totalSupply;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address account, uint256 amount) external {
        _balances[account] += amount;
        _totalSupply += amount;
    }

    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return _balances[account];
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        require(_balances[msg.sender] >= amount, "ERC20: transfer amount exceeds balance");
        _balances[msg.sender] -= amount;
        _balances[recipient] += amount;
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        require(_balances[sender] >= amount, "ERC20: transfer amount exceeds balance");
        require(_allowances[sender][msg.sender] >= amount, "ERC20: transfer exceeds allowance");
        _allowances[sender][msg.sender] -= amount;
        _balances[sender] -= amount;
        _balances[recipient] += amount;
        return true;
    }
}

contract MockAavePool is IPool {
    uint256 public flashFeeBps = 5; // 0.05% Aave v3 fee

    function supply(address, uint256, address, uint16) external override {}
    function withdraw(address, uint256, address) external pure override returns (uint256) { return 0; }

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16
    ) external override {
        uint256 premium = (amount * flashFeeBps) / 10_000;

        // Transfer borrowed tokens to receiver
        MockERC20(asset).mint(receiverAddress, amount);

        // Execute flash loan receiver callback
        bool success = AtomicFlashArbitrageRouter(payable(receiverAddress)).executeOperation(
            asset,
            amount,
            premium,
            receiverAddress,
            params
        );
        require(success, "Callback returned false");

        // Repay loan + premium
        uint256 totalDebt = amount + premium;
        require(
            MockERC20(asset).transferFrom(receiverAddress, address(this), totalDebt),
            "Flash loan repayment failed"
        );
    }
}

contract MockUniswapV2Router {
    uint256 public profitBonus;

    function setProfitBonus(uint256 bonus) external {
        profitBonus = bonus;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        address tokenIn = path[0];
        address tokenOut = path[path.length - 1];

        // Collect input tokens
        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        // Calculate output
        uint256 amountOut = amountIn + profitBonus;
        MockERC20(tokenOut).mint(to, amountOut);

        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountOut;
        return amounts;
    }
}

contract MockAerodromeRouter {
    uint256 public profitBonus;

    function setProfitBonus(uint256 bonus) external {
        profitBonus = bonus;
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256,
        Route[] calldata routes,
        address to,
        uint256
    ) external returns (uint256[] memory amounts) {
        address tokenIn = routes[0].from;
        address tokenOut = routes[routes.length - 1].to;

        MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);

        uint256 amountOut = amountIn + profitBonus;
        MockERC20(tokenOut).mint(to, amountOut);

        amounts = new uint256[](routes.length + 1);
        amounts[0] = amountIn;
        amounts[routes.length] = amountOut;
        return amounts;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ──────────────────────────────────────────────────────────────────────────────

contract AtomicFlashArbitrageRouterTest is TestBase {
    MockAavePool internal pool;
    MockERC20 internal usdc;
    MockERC20 internal dai;
    MockERC20 internal weth;
    MockUniswapV2Router internal uniRouter;
    MockAerodromeRouter internal aeroRouter;
    AtomicFlashArbitrageRouter internal router;

    address internal admin = address(0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98);
    address internal operator = address(0xABCD);
    address internal stranger = address(0x9999);

    function setUp() public {
        pool = new MockAavePool();
        usdc = new MockERC20("USD Coin", "USDC", 6);
        dai = new MockERC20("Dai Stablecoin", "DAI", 18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        uniRouter = new MockUniswapV2Router();
        aeroRouter = new MockAerodromeRouter();

        router = new AtomicFlashArbitrageRouter(address(pool), admin);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 1. CONSTRUCTOR & ADMIN ROLE TESTS
    // ──────────────────────────────────────────────────────────────────────────

    function testInitialization() external view {
        assertEq(router.admin(), admin, "admin mismatch");
        assertEq(router.aavePool(), address(pool), "pool mismatch");
    }

    function testAdminCanSetOperator() external {
        vm.prank(admin);
        router.setOperator(operator, true);
        assertTrue(router.isOperator(operator), "operator not set");

        vm.prank(admin);
        router.setOperator(operator, false);
        assertTrue(!router.isOperator(operator), "operator not cleared");
    }

    function testAdminCanUpdatePool() external {
        address newPool = address(0x5555);
        vm.prank(admin);
        router.setAavePool(newPool);
        assertEq(router.aavePool(), newPool, "updated pool mismatch");
    }

    function testAdminCanTransferAdmin() external {
        address newAdmin = address(0x7777);
        vm.prank(admin);
        router.setAdmin(newAdmin);
        assertEq(router.admin(), newAdmin, "new admin mismatch");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. UNISWAP V2 TRIANGULAR ARBITRAGE TEST (USDC -> DAI -> WETH -> USDC)
    // ──────────────────────────────────────────────────────────────────────────

    function testUniswapV2TriangularArbitrageSuccess() external {
        uint256 borrowAmount = 25_000 * 10 ** 6; // 25,000 USDC
        uint256 premium = (borrowAmount * 5) / 10_000; // 12.5 USDC
        uint256 expectedProfit = 21_440_000; // +21.44 USDC
        uint256 totalOutputBonus = premium + expectedProfit; // 33.94 USDC

        uniRouter.setProfitBonus(totalOutputBonus);

        address[] memory path = new address[](4);
        path[0] = address(usdc);
        path[1] = address(dai);
        path[2] = address(weth);
        path[3] = address(usdc);

        uint256 adminBalanceBefore = usdc.balanceOf(admin);

        vm.prank(admin);
        router.executeTriangularV2Arbitrage(
            address(usdc),
            borrowAmount,
            expectedProfit,
            admin,
            address(uniRouter),
            path
        );

        uint256 adminBalanceAfter = usdc.balanceOf(admin);
        assertEq(
            adminBalanceAfter - adminBalanceBefore,
            expectedProfit,
            "Profit not transferred to admin wallet"
        );
        assertEq(usdc.balanceOf(address(router)), 0, "Router should hold zero tokens after settlement");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. AERODROME CYCLICAL ARBITRAGE TEST
    // ──────────────────────────────────────────────────────────────────────────

    function testAerodromeCyclicalArbitrageSuccess() external {
        uint256 borrowAmount = 25_000 * 10 ** 6;
        uint256 premium = (borrowAmount * 5) / 10_000;
        uint256 expectedProfit = 30_000_000; // +30 USDC
        uint256 totalOutputBonus = premium + expectedProfit;

        aeroRouter.setProfitBonus(totalOutputBonus);

        Route[] memory routes = new Route[](2);
        routes[0] = Route({
            from: address(usdc),
            to: address(weth),
            stable: false,
            factory: address(0)
        });
        routes[1] = Route({
            from: address(weth),
            to: address(usdc),
            stable: false,
            factory: address(0)
        });

        uint256 adminBalanceBefore = usdc.balanceOf(admin);

        vm.prank(admin);
        router.executeAerodromeArbitrage(
            address(usdc),
            borrowAmount,
            expectedProfit,
            admin,
            address(aeroRouter),
            routes
        );

        uint256 adminBalanceAfter = usdc.balanceOf(admin);
        assertEq(
            adminBalanceAfter - adminBalanceBefore,
            expectedProfit,
            "Profit not transferred to admin from Aerodrome arb"
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. DUAL-DEX CROSS ARBITRAGE TEST (Uniswap V2 <-> Aerodrome)
    // ──────────────────────────────────────────────────────────────────────────

    function testDualDexArbitrageSuccess() external {
        uint256 borrowAmount = 10_000 * 10 ** 6;
        uint256 premium = (borrowAmount * 5) / 10_000; // 5 USDC
        uint256 profit = 15_000_000; // 15 USDC

        // Set routerB to return extra tokens to create profit
        MockUniswapV2Router routerB = new MockUniswapV2Router();
        routerB.setProfitBonus(premium + profit);

        uint256 adminBalanceBefore = usdc.balanceOf(admin);

        vm.prank(admin);
        router.executeDualDexArbitrage(
            address(usdc),
            borrowAmount,
            profit,
            admin,
            address(uniRouter),
            address(routerB),
            address(weth)
        );

        uint256 adminBalanceAfter = usdc.balanceOf(admin);
        assertEq(
            adminBalanceAfter - adminBalanceBefore,
            profit,
            "Dual-DEX profit mismatch"
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. GENERIC SWAP STEPS TEST
    // ──────────────────────────────────────────────────────────────────────────

    function testGenericStepArbitrageSuccess() external {
        uint256 borrowAmount = 5_000 * 10 ** 6;
        uint256 premium = (borrowAmount * 5) / 10_000;
        uint256 profit = 10_000_000;

        uniRouter.setProfitBonus(premium + profit);

        address[] memory path = new address[](2);
        path[0] = address(usdc);
        path[1] = address(usdc);

        bytes memory swapCalldata = abi.encodeWithSelector(
            MockUniswapV2Router.swapExactTokensForTokens.selector,
            borrowAmount,
            0,
            path,
            address(router),
            block.timestamp + 600
        );

        AtomicFlashArbitrageRouter.SwapStep[] memory steps = new AtomicFlashArbitrageRouter.SwapStep[](1);
        steps[0] = AtomicFlashArbitrageRouter.SwapStep({
            target: address(uniRouter),
            tokenIn: address(usdc),
            amountIn: borrowAmount,
            callData: swapCalldata
        });

        uint256 adminBalanceBefore = usdc.balanceOf(admin);

        vm.prank(admin);
        router.executeGenericArbitrage(
            address(usdc),
            borrowAmount,
            profit,
            admin,
            steps
        );

        uint256 adminBalanceAfter = usdc.balanceOf(admin);
        assertEq(
            adminBalanceAfter - adminBalanceBefore,
            profit,
            "Generic step profit mismatch"
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. OPERATOR DISPATCH TEST (Bot can execute on behalf of admin)
    // ──────────────────────────────────────────────────────────────────────────

    function testAuthorizedOperatorCanDispatchAndAdminReceivesProfit() external {
        vm.prank(admin);
        router.setOperator(operator, true);

        uint256 borrowAmount = 25_000 * 10 ** 6;
        uint256 premium = (borrowAmount * 5) / 10_000;
        uint256 profit = 21_440_000;
        uniRouter.setProfitBonus(premium + profit);

        address[] memory path = new address[](3);
        path[0] = address(usdc);
        path[1] = address(weth);
        path[2] = address(usdc);

        uint256 adminBalanceBefore = usdc.balanceOf(admin);

        // Operator triggers the trade
        vm.prank(operator);
        router.executeTriangularV2Arbitrage(
            address(usdc),
            borrowAmount,
            profit,
            admin,
            address(uniRouter),
            path
        );

        uint256 adminBalanceAfter = usdc.balanceOf(admin);
        assertEq(
            adminBalanceAfter - adminBalanceBefore,
            profit,
            "Admin must receive profit even when operator dispatches"
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 7. ANTI-LOSS SAFETY TEST (Reverts when swap is unprofitable)
    // ──────────────────────────────────────────────────────────────────────────

    function testAntiLossGuardRevertsOnInsufficientProfit() external {
        uint256 borrowAmount = 25_000 * 10 ** 6;
        // Don't set bonus on router -> swap produces zero profit, causing loss of flash fee
        uniRouter.setProfitBonus(0);

        address[] memory path = new address[](3);
        path[0] = address(usdc);
        path[1] = address(weth);
        path[2] = address(usdc);

        vm.prank(admin);
        try router.executeTriangularV2Arbitrage(
            address(usdc),
            borrowAmount,
            1_000_000, // Requires 1 USDC profit
            admin,
            address(uniRouter),
            path
        ) {
            assertTrue(false, "Should have reverted due to Anti-Loss Guard");
        } catch Error(string memory reason) {
            // Revert message bubbled from Aave pool / router
            assertTrue(bytes(reason).length > 0, "Expected revert message");
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 8. SECURITY TESTS (Caller validation & rescue functions)
    // ──────────────────────────────────────────────────────────────────────────

    function testUnauthorizedCallerCannotRequestFlashLoan() external {
        vm.prank(stranger);
        try router.requestFlashLoan(address(usdc), 1000, "0x") {
            assertTrue(false, "Stranger should not be authorized");
        } catch Error(string memory reason) {
            assertEq(reason, "Not authorized", "mismatch revert reason");
        }
    }

    function testAdminCanRescueTokens() external {
        uint256 rescueAmount = 100 * 10 ** 6;
        usdc.mint(address(router), rescueAmount);

        uint256 adminBalanceBefore = usdc.balanceOf(admin);

        vm.prank(admin);
        router.rescueTokens(address(usdc), admin, rescueAmount);

        uint256 adminBalanceAfter = usdc.balanceOf(admin);
        assertEq(
            adminBalanceAfter - adminBalanceBefore,
            rescueAmount,
            "Rescued token balance mismatch"
        );
    }
}
