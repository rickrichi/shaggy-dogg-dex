// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

/**
 * @title AaveFlashBorrower
 * @notice Executes uncollateralized flash loans via Aave v3 on Base L2
 * for triangular arbitrage and DEX liquidity balancing.
 */
contract AaveFlashBorrower is IFlashLoanSimpleReceiver {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    address public admin;
    address public aavePool;

    uint256 private _reentrancyStatus = _NOT_ENTERED;

    event FlashArbitrageInitiated(address indexed asset, uint256 amount);
    event FlashArbitrageExecuted(address indexed asset, uint256 amount, uint256 premium, uint256 netProfit);
    event AdminChanged(address indexed newAdmin);
    event AavePoolUpdated(address indexed newPool);
    event ProfitWithdrawn(address indexed token, address indexed recipient, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "Reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    constructor(address _aavePool, address _admin) {
        require(_aavePool != address(0), "Invalid pool");
        require(_admin != address(0), "Invalid admin");
        aavePool = _aavePool;
        admin = _admin;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    function setAavePool(address newPool) external onlyAdmin {
        require(newPool != address(0), "Invalid pool");
        aavePool = newPool;
        emit AavePoolUpdated(newPool);
    }

    /**
     * @notice Initiates a flash loan from Aave v3
     * @param asset The address of the token to borrow (e.g. WETH, USDC)
     * @param amount The principal amount to borrow
     * @param params Encoded parameters (e.g. minimum expected profit)
     */
    function requestFlashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external onlyAdmin nonReentrant {
        require(amount > 0, "Zero amount");
        emit FlashArbitrageInitiated(asset, amount);
        IPool(aavePool).flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0 // referralCode
        );
    }

    /**
     * @notice Callback invoked by Aave v3 Pool after tokens are transferred to this contract
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

        uint256 totalDebt = amount + premium;

        uint256 minProfit = 0;
        if (params.length >= 32) {
            minProfit = abi.decode(params, (uint256));
        }

        uint256 currentBalance = IERC20(asset).balanceOf(address(this));
        require(currentBalance >= totalDebt + minProfit, "Insufficient funds to repay debt and profit");

        uint256 netProfit = currentBalance - totalDebt;

        require(IERC20(asset).approve(aavePool, totalDebt), "Approval to pool failed");

        emit FlashArbitrageExecuted(asset, amount, premium, netProfit);
        return true;
    }

    /**
     * @notice Allows admin/creator to withdraw accumulated arbitrage profits
     */
    function withdrawProfit(
        address token,
        address to,
        uint256 amount
    ) external onlyAdmin nonReentrant {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        require(IERC20(token).transfer(to, amount), "Transfer failed");
        emit ProfitWithdrawn(token, to, amount);
    }
}
