// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AtomicFlashArbitrageRouter} from "../src/AtomicFlashArbitrageRouter.sol";
import {FixedSupplyToken} from "../src/FixedSupplyToken.sol";
import {Route} from "../src/Interfaces.sol";
import {AerodromeRouterLike, BaseForkSupport, ForkToken, V2RouterLike} from "./BaseForkSupport.sol";

/// The launchpad flash arbitrage router against real Base Aave v3 flash loans and real DEXes.
/// Price gaps are created the way they arise on-chain: a second genuine Uniswap V2 venue (the
/// project's pinned factory/router bytecode) and new Aerodrome pools are seeded off-market.
contract FlashRouterBaseForkTest is BaseForkSupport {
    address internal constant ADMIN = address(0xAD317);
    address internal constant DEPLOYER = address(0xDE9);
    address internal constant OPERATOR = address(0x0FE7);
    address internal constant STRANGER = address(0x9999);
    string internal constant GUARD = "Insufficient profit: Anti-loss guard triggered";

    AtomicFlashArbitrageRouter internal router;
    V2RouterLike internal ownDex; // genuine Uniswap V2 code, deployed fresh on the fork
    FixedSupplyToken internal lnch;
    uint256 internal wethPrice; // USDC (6 dp) per WETH on the real market

    function _deploy(bytes memory code) internal returns (address deployed) {
        assembly {
            deployed := create(0, add(code, 32), mload(code))
        }
        require(deployed != address(0), "deployment failed");
    }

    function setUp() public {
        _fork();
        vm.prank(DEPLOYER);
        router = new AtomicFlashArbitrageRouter(AAVE_POOL, ADMIN);
        lnch = new FixedSupplyToken("Launch Check", "LNCH", address(this), LAUNCH_SUPPLY);

        string memory json = vm.readFile("../src/config/dex/artifacts.json");
        address factory = _deploy(abi.encodePacked(vm.parseJsonBytes(json, ".factory.bytecode"), abi.encode(address(this))));
        ownDex = V2RouterLike(
            _deploy(abi.encodePacked(vm.parseJsonBytes(json, ".router.bytecode"), abi.encode(factory, WETH)))
        );

        _buyUsdc(address(this), 60 ether);
        _wrapEth(32 ether);
        // Priced after the purchase above, which itself moves Aerodrome's WETH/USDC pool.
        wethPrice = _wethPriceUsdc();
        ForkToken(USDC).approve(address(ownDex), type(uint256).max);
        ForkToken(WETH).approve(address(ownDex), type(uint256).max);
        lnch.approve(address(ownDex), type(uint256).max);
        ForkToken(USDC).approve(AERO_ROUTER, type(uint256).max);
        ForkToken(WETH).approve(AERO_ROUTER, type(uint256).max);
        lnch.approve(AERO_ROUTER, type(uint256).max);

        // Second V2 venue: WETH 10% below market. LNCH is worth exactly 1 USDC on it.
        uint256 cheap = (wethPrice * 90) / 100;
        ownDex.addLiquidity(WETH, USDC, 20 ether, 20 * cheap, 0, 0, address(this), block.timestamp);
        ownDex.addLiquidity(WETH, address(lnch), 5 ether, 5 * wethPrice * 1e12, 0, 0, address(this), block.timestamp);
        ownDex.addLiquidity(address(lnch), USDC, 20_000e18, 20_000e6, 0, 0, address(this), block.timestamp);

        // New Aerodrome pools: LNCH fair against WETH, 10% overpriced against USDC.
        AerodromeRouterLike(AERO_ROUTER).addLiquidity(
            address(lnch), WETH, false, 5 * wethPrice * 1e12, 5 ether, 0, 0, address(this), block.timestamp
        );
        AerodromeRouterLike(AERO_ROUTER).addLiquidity(
            address(lnch), USDC, false, 18_000e18, 20_000e6, 0, 0, address(this), block.timestamp
        );
    }

    function _usdc(address who) internal view returns (uint256) {
        return ForkToken(USDC).balanceOf(who);
    }

    function _path2(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    /// Buy cheap WETH on the second V2 venue, sell it on Aerodrome's real WETH/USDC pool.
    function _crossVenueSteps(uint256 loan) internal view returns (AtomicFlashArbitrageRouter.SwapStep[] memory steps) {
        uint256 wethOut = ownDex.getAmountsOut(loan, _path2(USDC, WETH))[1];
        steps = new AtomicFlashArbitrageRouter.SwapStep[](2);
        steps[0] = AtomicFlashArbitrageRouter.SwapStep(
            address(ownDex),
            USDC,
            loan,
            abi.encodeWithSelector(V2RouterLike.swapExactTokensForTokens.selector, loan, 0, _path2(USDC, WETH), address(router), block.timestamp)
        );
        steps[1] = AtomicFlashArbitrageRouter.SwapStep(
            AERO_ROUTER,
            WETH,
            wethOut,
            abi.encodeWithSelector(AerodromeRouterLike.swapExactTokensForTokens.selector, wethOut, 0, _aeroRoute(WETH, USDC), address(router), block.timestamp)
        );
    }

    // ── Roles ──────────────────────────────────────────────────────────────────

    function testInitialisationAndKnownIssueDeployerIsOperator() public view {
        require(router.admin() == ADMIN && router.aavePool() == AAVE_POOL, "constructor state");
        // KI-R1: the deploying account is an operator until revoked. LaunchpadSuiteDeployer revokes it.
        require(router.isOperator(DEPLOYER), "deployer starts as operator");
    }

    function testOnlyAdminControlsRolesPoolAndRescue() public {
        vm.startPrank(STRANGER);
        try router.setOperator(STRANGER, true) { revert("x1"); } catch {}
        try router.setAdmin(STRANGER) { revert("x2"); } catch {}
        try router.setAavePool(STRANGER) { revert("x3"); } catch {}
        try router.rescueTokens(USDC, STRANGER, 1) { revert("x4"); } catch {}
        try router.rescueETH(payable(STRANGER), 1) { revert("x5"); } catch {}
        try router.withdrawProfit(USDC, STRANGER, 1) { revert("x6"); } catch {}
        vm.stopPrank();

        vm.startPrank(ADMIN);
        try router.setAdmin(address(0)) { revert("zero admin"); } catch {}
        try router.setAavePool(address(0)) { revert("zero pool"); } catch {}
        try router.setOperator(address(0), true) { revert("zero operator"); } catch {}
        router.setOperator(OPERATOR, true);
        router.setAavePool(address(0x1234));
        require(router.aavePool() == address(0x1234), "pool rotated");
        router.setAavePool(AAVE_POOL);
        router.setAdmin(OPERATOR);
        vm.stopPrank();
        require(router.admin() == OPERATOR && router.isOperator(OPERATOR), "admin handed over");
    }

    function testStrangersCannotDispatchOrCallTheCallback() public {
        AtomicFlashArbitrageRouter.SwapStep[] memory steps = _crossVenueSteps(1_000e6);
        vm.prank(STRANGER);
        vm.expectRevert(bytes("Not authorized"));
        router.executeGenericArbitrage(USDC, 1_000e6, 0, STRANGER, steps);

        vm.expectRevert(bytes("Caller must be Aave pool"));
        router.executeOperation(USDC, 1, 0, address(router), "");
        vm.prank(AAVE_POOL);
        vm.expectRevert(bytes("Initiator must be this contract"));
        router.executeOperation(USDC, 1, 0, STRANGER, "");
    }

    // ── Real arbitrage on real Aave flash loans ────────────────────────────────

    function testGenericStepsCaptureACrossVenueGap() public {
        uint256 before = _usdc(ADMIN);
        uint256 aaveCash = _usdc(AUSDC);
        AtomicFlashArbitrageRouter.SwapStep[] memory steps = _crossVenueSteps(2_000e6);
        vm.prank(ADMIN);
        router.executeGenericArbitrage(USDC, 2_000e6, 1e6, address(0), steps);
        require(_usdc(ADMIN) > before + 1e6, "profit paid to the admin");
        require(_usdc(address(router)) == 0, "router keeps nothing");
        require(_usdc(AUSDC) > aaveCash, "Aave repaid with its premium");
    }

    function testDualDexArbitrageBetweenTwoV2Venues() public {
        uint256 before = _usdc(ADMIN);
        vm.prank(ADMIN);
        router.executeDualDexArbitrage(USDC, 1_000e6, 1e6, ADMIN, address(ownDex), UNI_V2_ROUTER, WETH);
        require(_usdc(ADMIN) > before + 1e6, "cheap venue to real Uniswap V2 is profitable");
    }

    function testTriangularV2Arbitrage() public {
        address[] memory path = new address[](4);
        path[0] = USDC;
        path[1] = WETH;
        path[2] = address(lnch);
        path[3] = USDC;
        uint256 before = _usdc(ADMIN);
        vm.prank(ADMIN);
        router.executeTriangularV2Arbitrage(USDC, 500e6, 1e6, ADMIN, address(ownDex), path);
        require(_usdc(ADMIN) > before + 1e6, "USDC -> WETH -> LNCH -> USDC profit");
    }

    function testAerodromeCyclicalArbitrage() public {
        Route[] memory routes = new Route[](3);
        routes[0] = Route(USDC, WETH, false, AERO_FACTORY);
        routes[1] = Route(WETH, address(lnch), false, AERO_FACTORY);
        routes[2] = Route(address(lnch), USDC, false, AERO_FACTORY);
        uint256 before = _usdc(ADMIN);
        vm.prank(ADMIN);
        router.executeAerodromeArbitrage(USDC, 500e6, 1e6, ADMIN, AERO_ROUTER, routes);
        require(_usdc(ADMIN) > before + 1e6, "Aerodrome cycle profit");
    }

    function testAntiLossGuardRevertsALosingRouteAndAnUnmetTarget() public {
        // Wrong direction: buy WETH at market on Uniswap V2, sell it 10% cheap.
        vm.prank(ADMIN);
        vm.expectRevert(bytes(GUARD));
        router.executeDualDexArbitrage(USDC, 1_000e6, 0, ADMIN, UNI_V2_ROUTER, address(ownDex), WETH);

        // Profitable route, but the profit target is above what the gap yields.
        AtomicFlashArbitrageRouter.SwapStep[] memory steps = _crossVenueSteps(2_000e6);
        vm.prank(ADMIN);
        vm.expectRevert(bytes(GUARD));
        router.executeGenericArbitrage(USDC, 2_000e6, 1_000e6, ADMIN, steps);

        // No route at all: the borrowed amount cannot cover Aave's premium.
        vm.prank(ADMIN);
        vm.expectRevert(bytes(GUARD));
        router.requestFlashLoan(USDC, 1_000e6, abi.encode(uint256(0)));
    }

    function testOperatorDispatchPaysAdminByDefaultAndRevocationEndsAccess() public {
        vm.prank(ADMIN);
        router.setOperator(OPERATOR, true);
        uint256 before = _usdc(ADMIN);
        AtomicFlashArbitrageRouter.SwapStep[] memory steps = _crossVenueSteps(2_000e6);
        vm.prank(OPERATOR);
        router.executeGenericArbitrage(USDC, 2_000e6, 1e6, address(0), steps);
        require(_usdc(ADMIN) > before && _usdc(OPERATOR) == 0, "profit goes to the admin, not the operator");

        vm.prank(ADMIN);
        router.setOperator(OPERATOR, false);
        vm.prank(OPERATOR);
        vm.expectRevert(bytes("Not authorized"));
        router.executeGenericArbitrage(USDC, 2_000e6, 1e6, address(0), steps);
    }

    function testAdminRescuesTokensAndEth() public {
        ForkToken(USDC).transfer(address(router), 5e6);
        vm.deal(address(router), 1 ether);
        vm.startPrank(ADMIN);
        router.rescueTokens(USDC, ADMIN, 3e6);
        router.withdrawProfit(USDC, ADMIN, 2e6);
        router.rescueETH(payable(ADMIN), 1 ether);
        try router.rescueTokens(USDC, address(0), 1) { revert("zero recipient"); } catch {}
        try router.rescueTokens(USDC, ADMIN, 0) { revert("zero amount"); } catch {}
        vm.stopPrank();
        require(_usdc(ADMIN) == 5e6 && ADMIN.balance == 1 ether, "rescued");
    }

    // ── Known issues, reproduced on real contracts (audit/KNOWN-ISSUES.md) ─────

    /// KI-R2: an operator can move any non-borrowed token the router holds through generic steps.
    function testKnownIssueOperatorCanMoveOtherTokensHeldByRouter() public {
        ForkToken(WETH).transfer(address(router), 1 ether);
        ForkToken(USDC).transfer(address(router), 5e6); // covers the flash premium
        vm.prank(ADMIN);
        router.setOperator(OPERATOR, true);
        AtomicFlashArbitrageRouter.SwapStep[] memory steps = new AtomicFlashArbitrageRouter.SwapStep[](1);
        steps[0] = AtomicFlashArbitrageRouter.SwapStep(
            WETH, address(0), 0, abi.encodeWithSelector(ForkToken.transfer.selector, OPERATOR, 1 ether)
        );
        vm.prank(OPERATOR);
        router.executeGenericArbitrage(USDC, 1_000e6, 0, address(0), steps);
        require(ForkToken(WETH).balanceOf(OPERATOR) == 1 ether, "operator took the router's WETH");
    }

    /// KI-R3: a balance of the borrowed asset already in the router is paid out as profit.
    function testKnownIssueExistingBalanceIsPaidOutAsProfit() public {
        ForkToken(USDC).transfer(address(router), 100e6);
        uint256 before = _usdc(ADMIN);
        vm.prank(ADMIN);
        router.requestFlashLoan(USDC, 1_000e6, abi.encode(uint256(0)));
        uint256 paid = _usdc(ADMIN) - before;
        require(paid > 99e6 && paid < 100e6, "pre-existing USDC paid out, less Aave's premium");
        require(_usdc(address(router)) == 0, "router emptied");
    }
}
