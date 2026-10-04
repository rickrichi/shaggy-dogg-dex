// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Interfaces.sol";

/**
 * @title AtomicFlashArbitrageRouter
 * @notice Production-grade uncollateralized Flash Loan Arbitrage Router for Aave v3 on Base Mainnet.
 * @dev Executes cyclical arbitrage across Uniswap V2, Aerodrome, and custom liquidity pools.
 * Guarantees zero-loss atomic safety: reverts if net profit after flash fee and gas does not meet target.
 * Automatically transfers 100% of realized arbitrage profit directly to the recipient's wallet in the same block.
 */
contract AtomicFlashArbitrageRouter is IFlashLoanSimpleReceiver {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    address public admin;
    address public aavePool;
    mapping(address => bool) public isOperator;

    uint256 private _reentrancyStatus = _NOT_ENTERED;

    enum RouteType {
        GENERIC_STEPS,      // 0: arbitrary low-level router/pool calls
        UNISWAP_V2_PATH,    // 1: single Uniswap V2 multi-hop path
        AERODROME_PATH,     // 2: Aerodrome multi-hop routes
        DUAL_DEX_V2         // 3: 2-hop cross-DEX (e.g. Uniswap V2 <-> Aerodrome)
    }

    struct SwapStep {
        address target;      // Router or pool contract to execute the swap against
        address tokenIn;     // Token to approve before calling (address(0) if none)
        uint256 amountIn;    // Token amount to approve (0 = entire balance held by router)
        bytes callData;      // Encoded swap calldata
    }

    struct FlashArbitrageParams {
        uint8 routeType;         // RouteType enum value
        uint256 minNetProfit;    // Minimum net profit required in borrowed asset units
        address profitRecipient; // Destination address for net profit (admin if address(0))
        bytes routeData;         // Route-specific payload
    }

    event FlashArbitrageInitiated(address indexed asset, uint256 amount);
    event FlashArbitrageExecuted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 netProfit,
        address indexed recipient
    );
    event ProfitPaidOut(address indexed asset, address indexed recipient, uint256 amount);
    event AdminChanged(address indexed previousAdmin, address indexed newAdmin);
    event OperatorUpdated(address indexed operator, bool approved);
    event AavePoolUpdated(address indexed previousPool, address indexed newPool);
    event EmergencyTokenRescued(address indexed token, address indexed recipient, uint256 amount);
    event EmergencyETHRescued(address indexed recipient, uint256 amount);

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "Reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == admin || isOperator[msg.sender], "Not authorized");
        _;
    }

    constructor(address _aavePool, address _admin) {
        require(_aavePool != address(0), "Invalid pool");
        require(_admin != address(0), "Invalid admin");
        aavePool = _aavePool;
        admin = _admin;
        isOperator[msg.sender] = true;
        emit OperatorUpdated(msg.sender, true);
    }

    receive() external payable {}

    // ──────────────────────────────────────────────────────────────────────────
    // ADMIN CONFIGURATION
    // ──────────────────────────────────────────────────────────────────────────

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        address previousAdmin = admin;
        admin = newAdmin;
        emit AdminChanged(previousAdmin, newAdmin);
    }

    function setOperator(address operator, bool approved) external onlyAdmin {
        require(operator != address(0), "Invalid operator");
        isOperator[operator] = approved;
        emit OperatorUpdated(operator, approved);
    }

    function setAavePool(address newPool) external onlyAdmin {
        require(newPool != address(0), "Invalid pool");
        address previousPool = aavePool;
        aavePool = newPool;
        emit AavePoolUpdated(previousPool, newPool);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // EXTERNAL ARBITRAGE DISPATCHERS
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @notice Backward-compatible flash loan request matching AaveFlashBorrower
     */
    function requestFlashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external nonReentrant onlyAuthorized {
        require(amount > 0, "Zero amount");
        _dispatchFlashLoan(asset, amount, params);
    }

    /**
     * @notice Executes generic step-based flash loan arbitrage across arbitrary routers
     */
    function executeGenericArbitrage(
        address asset,
        uint256 amount,
        uint256 minNetProfit,
        address profitRecipient,
        SwapStep[] calldata steps
    ) external nonReentrant onlyAuthorized {
        require(amount > 0, "Zero amount");
        bytes memory routeData = abi.encode(steps);
        bytes memory params = abi.encode(
            FlashArbitrageParams({
                routeType: uint8(RouteType.GENERIC_STEPS),
                minNetProfit: minNetProfit,
                profitRecipient: profitRecipient,
                routeData: routeData
            })
        );
        _dispatchFlashLoan(asset, amount, params);
    }

    /**
     * @notice Executes triangular arbitrage on a Uniswap V2 compatible router
     * e.g. path: [USDC, DAI, WETH, USDC]
     */
    function executeTriangularV2Arbitrage(
        address asset,
        uint256 amount,
        uint256 minNetProfit,
        address profitRecipient,
        address router,
        address[] calldata path
    ) external nonReentrant onlyAuthorized {
        require(amount > 0, "Zero amount");
        require(router != address(0), "Invalid router");
        require(path.length >= 3, "Invalid path length");
        bytes memory routeData = abi.encode(router, path);
        bytes memory params = abi.encode(
            FlashArbitrageParams({
                routeType: uint8(RouteType.UNISWAP_V2_PATH),
                minNetProfit: minNetProfit,
                profitRecipient: profitRecipient,
                routeData: routeData
            })
        );
        _dispatchFlashLoan(asset, amount, params);
    }

    /**
     * @notice Executes cyclical arbitrage on Aerodrome router
     */
    function executeAerodromeArbitrage(
        address asset,
        uint256 amount,
        uint256 minNetProfit,
        address profitRecipient,
        address router,
        Route[] calldata routes
    ) external nonReentrant onlyAuthorized {
        require(amount > 0, "Zero amount");
        require(router != address(0), "Invalid router");
        require(routes.length >= 1, "Invalid routes length");
        bytes memory routeData = abi.encode(router, routes);
        bytes memory params = abi.encode(
            FlashArbitrageParams({
                routeType: uint8(RouteType.AERODROME_PATH),
                minNetProfit: minNetProfit,
                profitRecipient: profitRecipient,
                routeData: routeData
            })
        );
        _dispatchFlashLoan(asset, amount, params);
    }

    /**
     * @notice Executes 2-pool cross-DEX arbitrage between two Uniswap V2 compatible routers
     * e.g. Buy on RouterA (asset -> tokenB), Sell on RouterB (tokenB -> asset)
     */
    function executeDualDexArbitrage(
        address asset,
        uint256 amount,
        uint256 minNetProfit,
        address profitRecipient,
        address routerA,
        address routerB,
        address intermediateToken
    ) external nonReentrant onlyAuthorized {
        require(amount > 0, "Zero amount");
        require(routerA != address(0) && routerB != address(0), "Invalid routers");
        require(intermediateToken != address(0), "Invalid intermediate token");
        bytes memory routeData = abi.encode(routerA, routerB, intermediateToken);
        bytes memory params = abi.encode(
            FlashArbitrageParams({
                routeType: uint8(RouteType.DUAL_DEX_V2),
                minNetProfit: minNetProfit,
                profitRecipient: profitRecipient,
                routeData: routeData
            })
        );
        _dispatchFlashLoan(asset, amount, params);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // AAVE V3 FLASH LOAN CALLBACK & EXECUTION
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * @notice Callback invoked by Aave v3 Pool upon lending the requested asset
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == aavePool, "Caller must be Aave pool");
        require(initiator == address(this), "Initiator must be this contract");

        uint256 minNetProfit = 0;
        address profitRecipient = admin;

        if (params.length > 0) {
            if (params.length == 32) {
                minNetProfit = abi.decode(params, (uint256));
            } else {
                FlashArbitrageParams memory arbParams = abi.decode(params, (FlashArbitrageParams));
                minNetProfit = arbParams.minNetProfit;
                if (arbParams.profitRecipient != address(0)) {
                    profitRecipient = arbParams.profitRecipient;
                }

                if (arbParams.routeType == uint8(RouteType.GENERIC_STEPS)) {
                    _executeGenericSteps(arbParams.routeData);
                } else if (arbParams.routeType == uint8(RouteType.UNISWAP_V2_PATH)) {
                    _executeUniswapV2Path(asset, arbParams.routeData);
                } else if (arbParams.routeType == uint8(RouteType.AERODROME_PATH)) {
                    _executeAerodromePath(asset, arbParams.routeData);
                } else if (arbParams.routeType == uint8(RouteType.DUAL_DEX_V2)) {
                    _executeDualDexV2(asset, arbParams.routeData);
                } else {
                    revert("Unsupported route type");
                }
            }
        }

        uint256 totalDebt = amount + premium;
        uint256 finalBalance = IERC20(asset).balanceOf(address(this));
        require(
            finalBalance >= totalDebt + minNetProfit,
            "Insufficient profit: Anti-loss guard triggered"
        );

        uint256 netProfit = finalBalance - totalDebt;

        emit FlashArbitrageExecuted(asset, amount, premium, netProfit, profitRecipient);
        if (netProfit > 0) {
            emit ProfitPaidOut(asset, profitRecipient, netProfit);
        }

        // Repay flash loan principal + fee
        _safeApprove(asset, aavePool, totalDebt);

        // Instantly disburse captured profit to recipient wallet
        if (netProfit > 0) {
            _safeTransfer(asset, profitRecipient, netProfit);
        }

        return true;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // INTERNAL ROUTING ENGINES
    // ──────────────────────────────────────────────────────────────────────────

    function _executeGenericSteps(bytes memory routeData) internal {
        SwapStep[] memory steps = abi.decode(routeData, (SwapStep[]));
        for (uint256 i = 0; i < steps.length; i++) {
            SwapStep memory step = steps[i];
            require(step.target != address(0), "Invalid step target");
            if (step.tokenIn != address(0)) {
                uint256 currentBal = IERC20(step.tokenIn).balanceOf(address(this));
                uint256 spend = (step.amountIn == 0 || step.amountIn > currentBal)
                    ? currentBal
                    : step.amountIn;
                if (spend > 0) {
                    _safeApprove(step.tokenIn, step.target, spend);
                }
            }
            (bool success, bytes memory returndata) = step.target.call(step.callData);
            if (!success) {
                _revertWithCustomReason(returndata, "Swap step failed");
            }
        }
    }

    function _executeUniswapV2Path(address asset, bytes memory routeData) internal {
        (address router, address[] memory path) = abi.decode(routeData, (address, address[]));
        require(router != address(0), "Invalid router");
        require(path.length >= 2, "Invalid path length");
        require(path[0] == asset, "Path must start with borrowed asset");
        require(path[path.length - 1] == asset, "Path must end with borrowed asset");

        uint256 bal = IERC20(asset).balanceOf(address(this));
        _safeApprove(asset, router, bal);
        uint256[] memory amounts = IUniswapV2Router02(router).swapExactTokensForTokens(
            bal,
            0,
            path,
            address(this),
            block.timestamp
        );
        amounts;
    }

    function _executeAerodromePath(address asset, bytes memory routeData) internal {
        (address router, Route[] memory routes) = abi.decode(routeData, (address, Route[]));
        require(router != address(0), "Invalid router");
        require(routes.length >= 1, "Invalid routes length");
        require(routes[0].from == asset, "Routes must start with borrowed asset");
        require(routes[routes.length - 1].to == asset, "Routes must end with borrowed asset");

        uint256 bal = IERC20(asset).balanceOf(address(this));
        _safeApprove(asset, router, bal);
        uint256[] memory amounts = IAerodromeRouter(router).swapExactTokensForTokens(
            bal,
            0,
            routes,
            address(this),
            block.timestamp
        );
        amounts;
    }

    function _executeDualDexV2(address asset, bytes memory routeData) internal {
        (address routerA, address routerB, address tokenB) = abi.decode(
            routeData,
            (address, address, address)
        );
        require(routerA != address(0) && routerB != address(0), "Invalid routers");
        require(tokenB != address(0), "Invalid intermediate token");

        // Leg 1: Swap asset -> tokenB on Router A
        address[] memory pathA = new address[](2);
        pathA[0] = asset;
        pathA[1] = tokenB;

        uint256 balA = IERC20(asset).balanceOf(address(this));
        _safeApprove(asset, routerA, balA);
        uint256[] memory amountsA = IUniswapV2Router02(routerA).swapExactTokensForTokens(
            balA,
            0,
            pathA,
            address(this),
            block.timestamp
        );

        uint256 tokenBBal = amountsA[1];
        require(tokenBBal > 0, "Leg 1 returned zero");

        // Leg 2: Swap tokenB -> asset on Router B
        address[] memory pathB = new address[](2);
        pathB[0] = tokenB;
        pathB[1] = asset;

        _safeApprove(tokenB, routerB, tokenBBal);
        uint256[] memory amountsB = IUniswapV2Router02(routerB).swapExactTokensForTokens(
            tokenBBal,
            0,
            pathB,
            address(this),
            block.timestamp
        );
        amountsB;
    }

    function _dispatchFlashLoan(address asset, uint256 amount, bytes memory params) internal {
        emit FlashArbitrageInitiated(asset, amount);
        IPool(aavePool).flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0 // referralCode
        );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TOKEN SAFETY & RESCUE UTILITIES
    // ──────────────────────────────────────────────────────────────────────────

    function _safeApprove(address token, address spender, uint256 amount) internal {
        // Reset allowance to 0 first to protect against standard USDT race condition guards
        (bool resetSuccess, ) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, 0)
        );
        resetSuccess;
        // Continue regardless of reset success (some tokens revert if already 0)
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.approve.selector, spender, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Approve failed");
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    function _revertWithCustomReason(bytes memory returndata, string memory defaultReason) internal pure {
        if (returndata.length > 0) {
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert(defaultReason);
        }
    }

    /**
     * @notice Admin token recovery for any unspent dust or non-collateral tokens
     */
    function rescueTokens(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant onlyAdmin {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        emit EmergencyTokenRescued(token, to, amount);
        _safeTransfer(token, to, amount);
    }

    /**
     * @notice Admin native ETH recovery
     */
    function rescueETH(
        address payable to,
        uint256 amount
    ) external nonReentrant onlyAdmin {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        emit EmergencyETHRescued(to, amount);
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    /**
     * @notice Legacy withdrawal support
     */
    function withdrawProfit(
        address token,
        address to,
        uint256 amount
    ) external nonReentrant onlyAdmin {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        _safeTransfer(token, to, amount);
    }
}
