// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./GovernanceToken.sol";
import "./FeeDiscountStaking.sol";

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IPool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IAToken {
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title YieldStakingVault
 * @notice Yield-bearing vault that supplies deposited assets (e.g. USDC, WETH) to Aave v3.
 * Stakers receive vault shares. Performance fees are discounted for SD token stakers,
 * with protocol performance yield accruing directly to the contract creator / treasury.
 */
contract YieldStakingVault {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    IERC20 public immutable underlyingAsset;
    address public aavePool;
    address public aToken;
    FeeDiscountStaking public discountStaking;

    address public admin;
    address public treasury;

    // Default performance fee in basis points (1000 = 10%)
    uint16 public performanceFeeBps = 1000;

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => uint256) public principalDeposited;

    uint256 private _reentrancyStatus = _NOT_ENTERED;

    event Deposit(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdraw(address indexed user, uint256 amount, uint256 sharesBurned, uint256 performanceFee);
    event PerformanceFeeUpdated(uint16 newFeeBps);
    event AdminChanged(address indexed newAdmin);
    event TreasuryChanged(address indexed newTreasury);
    event AavePoolUpdated(address indexed newPool, address indexed newAToken);

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

    constructor(
        address _underlyingAsset,
        address _aavePool,
        address _aToken,
        address _discountStaking,
        address _admin,
        address _treasury
    ) {
        require(_underlyingAsset != address(0), "Invalid asset");
        require(_admin != address(0), "Invalid admin");
        require(_treasury != address(0), "Invalid treasury");

        underlyingAsset = IERC20(_underlyingAsset);
        aavePool = _aavePool;
        aToken = _aToken;
        if (_discountStaking != address(0)) {
            discountStaking = FeeDiscountStaking(_discountStaking);
        }
        admin = _admin;
        treasury = _treasury;
    }

    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    function setTreasury(address newTreasury) external onlyAdmin {
        require(newTreasury != address(0), "Invalid treasury");
        treasury = newTreasury;
        emit TreasuryChanged(newTreasury);
    }

    function setPerformanceFee(uint16 newFeeBps) external onlyAdmin {
        require(newFeeBps <= 3000, "Max 30% fee");
        performanceFeeBps = newFeeBps;
        emit PerformanceFeeUpdated(newFeeBps);
    }

    function setAavePoolAndAToken(address newPool, address newAToken) external onlyAdmin {
        aavePool = newPool;
        aToken = newAToken;
        emit AavePoolUpdated(newPool, newAToken);
    }

    /**
     * @notice Total underlying assets under management (deposited in Aave + vault cash)
     */
    function totalAssets() public view returns (uint256) {
        uint256 aTokenBalance = 0;
        if (aToken != address(0)) {
            aTokenBalance = IAToken(aToken).balanceOf(address(this));
        }
        return underlyingAsset.balanceOf(address(this)) + aTokenBalance;
    }

    /**
     * @notice Deposit underlying tokens, supply to Aave, and receive vault shares
     */
    function deposit(uint256 amount) external nonReentrant returns (uint256 shares) {
        require(amount > 0, "Zero amount");

        uint256 assetsBefore = totalAssets();

        // Transfer tokens from user to vault
        require(underlyingAsset.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        // Supply to Aave if pool is set
        if (aavePool != address(0)) {
            underlyingAsset.approve(aavePool, amount);
            IPool(aavePool).supply(address(underlyingAsset), amount, address(this), 0);
        }

        if (totalShares == 0 || assetsBefore == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / assetsBefore;
        }

        totalShares += shares;
        sharesOf[msg.sender] += shares;
        principalDeposited[msg.sender] += amount;

        emit Deposit(msg.sender, amount, shares);
        return shares;
    }

    /**
     * @notice Withdraw shares, redeeming from Aave with SD staker fee discounts applied
     */
    function withdraw(uint256 shares) external nonReentrant returns (uint256 netPayout) {
        require(shares > 0, "Zero shares");
        require(sharesOf[msg.sender] >= shares, "Insufficient shares");

        uint256 totalA = totalAssets();
        uint256 grossAmount = (shares * totalA) / totalShares;

        totalShares -= shares;
        sharesOf[msg.sender] -= shares;

        // Calculate performance fee on yield profit
        uint256 principalPortion = (principalDeposited[msg.sender] * shares) / (sharesOf[msg.sender] + shares);
        if (principalDeposited[msg.sender] >= principalPortion) {
            principalDeposited[msg.sender] -= principalPortion;
        } else {
            principalDeposited[msg.sender] = 0;
        }

        uint256 fee = 0;
        if (grossAmount > principalPortion) {
            uint256 yieldProfit = grossAmount - principalPortion;
            uint16 effectiveFeeBps = performanceFeeBps;

            // Apply SD staker discount if discountStaking is configured
            if (address(discountStaking) != address(0)) {
                uint16 discountBps = discountStaking.getTier(msg.sender);
                // discountBps up to 1000 (100% discount on performance fee)
                if (discountBps >= 1000) {
                    effectiveFeeBps = 0;
                } else {
                    effectiveFeeBps = uint16((uint256(effectiveFeeBps) * (1000 - discountBps)) / 1000);
                }
            }

            fee = (yieldProfit * effectiveFeeBps) / 10_000;
        }

        netPayout = grossAmount - fee;

        // Withdraw from Aave if needed
        if (aavePool != address(0) && underlyingAsset.balanceOf(address(this)) < grossAmount) {
            uint256 deficit = grossAmount - underlyingAsset.balanceOf(address(this));
            IPool(aavePool).withdraw(address(underlyingAsset), deficit, address(this));
        }

        if (fee > 0 && treasury != address(0)) {
            require(underlyingAsset.transfer(treasury, fee), "Fee transfer failed");
        }

        require(underlyingAsset.transfer(msg.sender, netPayout), "Payout failed");

        emit Withdraw(msg.sender, netPayout, shares, fee);
        return netPayout;
    }
}
