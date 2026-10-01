// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Interfaces.sol";
import "./GovernanceToken.sol";
import "./FeeDiscountStaking.sol";

/**
 * @title IsolatedLendingVault
 * @notice Next-Gen ERC-4626 Isolated Lending & Yield Vault inspired by Morpho Blue,
 * Moonwell, and Silo Finance. Designed for risk isolation on Base Mainnet.
 * 
 * Features:
 * 1. Risk-Isolated Asset Market: Prevents systemic contagion from exotic tokens.
 * 2. Pluggable Lending Router: Supplies underlying assets to Moonwell, Morpho Blue, or Aave.
 * 3. ERC-4626 Tokenized Vault Standard: Instant composability with DeFi aggregators.
 * 4. Staker Performance Fee Discount: Integrates with FeeDiscountStaking for VIP fee discounts.
 * 5. Protocol Treasury Streaming: Directs protocol performance cuts to the creator treasury.
 */
contract IsolatedLendingVault is IERC4626 {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    IERC20 public immutable assetToken;
    FeeDiscountStaking public discountStaking;

    address public admin;
    address public treasury;

    // External market routing (0 = autonomous isolated vault, non-zero = Moonwell mToken or Morpho)
    address public lendingMarketAdapter;

    uint16 public performanceFeeBps = 1000; // 10% default
    uint256 public override totalSupply;
    mapping(address => uint256) public override balanceOf;
    mapping(address => mapping(address => uint256)) public override allowance;

    mapping(address => uint256) public principalDeposited;
    uint256 private _reentrancyStatus = _NOT_ENTERED;

    event LendingMarketUpdated(address indexed newAdapter);
    event PerformanceFeeUpdated(uint16 newFeeBps);
    event AdminChanged(address indexed newAdmin);
    event TreasuryChanged(address indexed newTreasury);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

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
        string memory _name,
        string memory _symbol,
        address _asset,
        address _discountStaking,
        address _admin,
        address _treasury
    ) {
        require(_asset != address(0), "Invalid asset");
        require(_admin != address(0), "Invalid admin");
        require(_treasury != address(0), "Invalid treasury");

        name = _name;
        symbol = _symbol;
        assetToken = IERC20(_asset);

        if (_discountStaking != address(0)) {
            discountStaking = FeeDiscountStaking(_discountStaking);
        }

        admin = _admin;
        treasury = _treasury;
    }

    function asset() external view override returns (address) {
        return address(assetToken);
    }

    function totalAssets() public view override returns (uint256) {
        if (lendingMarketAdapter != address(0)) {
            return assetToken.balanceOf(address(this)) + IMoonwellMToken(lendingMarketAdapter).balanceOf(address(this));
        }
        return assetToken.balanceOf(address(this));
    }

    function convertToShares(uint256 assets) public view override returns (uint256) {
        uint256 totalA = totalAssets();
        if (totalSupply == 0 || totalA == 0) return assets;
        return (assets * totalSupply) / totalA;
    }

    function convertToAssets(uint256 shares) public view override returns (uint256) {
        if (totalSupply == 0) return shares;
        return (shares * totalAssets()) / totalSupply;
    }

    function deposit(uint256 assets, address receiver) external override nonReentrant returns (uint256 shares) {
        require(assets > 0, "Zero assets");
        require(receiver != address(0), "Zero receiver");

        shares = convertToShares(assets);
        require(shares > 0, "Zero shares");

        require(assetToken.transferFrom(msg.sender, address(this), assets), "Transfer failed");

        // Supply to external lending market if configured
        if (lendingMarketAdapter != address(0)) {
            assetToken.approve(lendingMarketAdapter, assets);
            IMoonwellMToken(lendingMarketAdapter).mint(assets);
        }

        totalSupply += shares;
        balanceOf[receiver] += shares;
        principalDeposited[receiver] += assets;

        emit Transfer(address(0), receiver, shares);
        return shares;
    }

    function mint(uint256 shares, address receiver) external override returns (uint256 assets) {
        assets = convertToAssets(shares);
        require(assets > 0, "Zero assets");
        require(receiver != address(0), "Zero receiver");

        require(assetToken.transferFrom(msg.sender, address(this), assets), "Transfer failed");

        if (lendingMarketAdapter != address(0)) {
            assetToken.approve(lendingMarketAdapter, assets);
            IMoonwellMToken(lendingMarketAdapter).mint(assets);
        }

        totalSupply += shares;
        balanceOf[receiver] += shares;
        principalDeposited[receiver] += assets;

        emit Transfer(address(0), receiver, shares);
        return assets;
    }

    function withdraw(uint256 assets, address receiver, address owner) external override nonReentrant returns (uint256 shares) {
        require(assets > 0, "Zero assets");
        shares = convertToShares(assets);

        if (msg.sender != owner) {
            uint256 currentAllowance = allowance[owner][msg.sender];
            require(currentAllowance >= shares, "Allowance exceeded");
            allowance[owner][msg.sender] = currentAllowance - shares;
        }

        _redeemInternal(shares, receiver, owner);
        return shares;
    }

    function redeem(uint256 shares, address receiver, address owner) external override nonReentrant returns (uint256 assets) {
        require(shares > 0, "Zero shares");

        if (msg.sender != owner) {
            uint256 currentAllowance = allowance[owner][msg.sender];
            require(currentAllowance >= shares, "Allowance exceeded");
            allowance[owner][msg.sender] = currentAllowance - shares;
        }

        return _redeemInternal(shares, receiver, owner);
    }

    function _redeemInternal(uint256 shares, address receiver, address owner) internal returns (uint256 netPayout) {
        require(balanceOf[owner] >= shares, "Insufficient balance");

        uint256 grossAmount = convertToAssets(shares);
        totalSupply -= shares;
        balanceOf[owner] -= shares;

        // Redeem from lending market if needed
        if (lendingMarketAdapter != address(0) && assetToken.balanceOf(address(this)) < grossAmount) {
            uint256 needed = grossAmount - assetToken.balanceOf(address(this));
            IMoonwellMToken(lendingMarketAdapter).redeemUnderlying(needed);
        }

        // Calculate performance fee on yield profit
        uint256 principal = principalDeposited[owner];
        uint256 fee = 0;

        if (grossAmount > principal && principal > 0) {
            uint256 yieldProfit = grossAmount - principal;
            uint16 effectiveFeeBps = performanceFeeBps;

            if (address(discountStaking) != address(0)) {
                uint16 discountBps = discountStaking.getTier(owner);
                if (discountBps >= 10_000) {
                    effectiveFeeBps = 0;
                } else if (discountBps > 0) {
                    effectiveFeeBps = uint16((uint256(effectiveFeeBps) * (10_000 - discountBps)) / 10_000);
                }
            }

            fee = (yieldProfit * effectiveFeeBps) / 10_000;
        }

        netPayout = grossAmount - fee;

        if (fee > 0 && treasury != address(0)) {
            require(assetToken.transfer(treasury, fee), "Treasury fee failed");
        }

        require(assetToken.transfer(receiver, netPayout), "Payout failed");
        emit Transfer(owner, address(0), shares);
        return netPayout;
    }

    // --- ERC-20 Functions for Vault Shares ---

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(msg.sender, recipient, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        uint256 currentAllowance = allowance[sender][msg.sender];
        require(currentAllowance >= amount, "Allowance exceeded");
        allowance[sender][msg.sender] = currentAllowance - amount;

        require(balanceOf[sender] >= amount, "Insufficient balance");
        balanceOf[sender] -= amount;
        balanceOf[recipient] += amount;
        emit Transfer(sender, recipient, amount);
        return true;
    }

    // --- Admin Config ---

    function setLendingMarketAdapter(address newAdapter) external onlyAdmin {
        lendingMarketAdapter = newAdapter;
        emit LendingMarketUpdated(newAdapter);
    }

    function setPerformanceFee(uint16 newFeeBps) external onlyAdmin {
        require(newFeeBps <= 3000, "Max 30% fee");
        performanceFeeBps = newFeeBps;
        emit PerformanceFeeUpdated(newFeeBps);
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
}
