// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Interfaces.sol";
import "./GovernanceToken.sol";
import "./FeeDiscountStaking.sol";
import "./FeeDiscountMath.sol";

/**
 * @title CompoundYieldVault
 * @notice Yield-bearing vault that supplies assets to Compound v3 (Comet) on Base L2.
 * Stakers receive vault shares. Performance fees are discounted for SD token stakers,
 * with protocol performance yield accruing directly to the contract creator / treasury.
 */
contract CompoundYieldVault {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    IERC20 public immutable underlyingAsset;
    IComet public comet;
    FeeDiscountStaking public discountStaking;

    address public admin;
    address public treasury;

    // Default performance fee in basis points (1000 = 10%)
    uint16 public performanceFeeBps = 1000;

    function discountDenominator() external pure returns (uint256) { return 10_000; }

    uint256 public totalShares;
    mapping(address => uint256) public sharesOf;
    mapping(address => uint256) public principalDeposited;

    uint256 private _reentrancyStatus = _NOT_ENTERED;

    event Deposit(address indexed user, uint256 amount, uint256 sharesMinted);
    event Withdraw(address indexed user, uint256 amount, uint256 sharesBurned, uint256 performanceFee);
    event PerformanceFeeUpdated(uint16 newFeeBps);
    event AdminChanged(address indexed newAdmin);
    event TreasuryChanged(address indexed newTreasury);
    event CometUpdated(address indexed newComet);

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
        address _comet,
        address _discountStaking,
        address _admin,
        address _treasury
    ) {
        require(_underlyingAsset != address(0), "Invalid asset");
        require(_admin != address(0), "Invalid admin");
        require(_treasury != address(0), "Invalid treasury");

        underlyingAsset = IERC20(_underlyingAsset);
        if (_comet != address(0)) {
            comet = IComet(_comet);
        }
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

    function setComet(address newComet) external onlyAdmin {
        comet = IComet(newComet);
        emit CometUpdated(newComet);
    }

    /**
     * @notice Total underlying assets managed by vault (held in contract + supplied to Compound)
     */
    function totalAssets() public view returns (uint256) {
        uint256 cometBalance = 0;
        if (address(comet) != address(0)) {
            cometBalance = comet.balanceOf(address(this));
        }
        return underlyingAsset.balanceOf(address(this)) + cometBalance;
    }

    /**
     * @notice Deposit underlying tokens, supply to Compound v3 Comet, receive vault shares
     */
    function deposit(uint256 amount) external nonReentrant returns (uint256 shares) {
        require(amount > 0, "Zero amount");

        uint256 assetsBefore = totalAssets();

        require(underlyingAsset.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        if (address(comet) != address(0)) {
            underlyingAsset.approve(address(comet), amount);
            comet.supply(address(underlyingAsset), amount);
        }

        if (totalShares == 0 || assetsBefore == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / assetsBefore;
        }

        require(shares > 0, "Deposit too small");
        totalShares += shares;
        sharesOf[msg.sender] += shares;
        principalDeposited[msg.sender] += amount;

        emit Deposit(msg.sender, amount, shares);
        return shares;
    }

    /**
     * @notice Withdraw shares from Compound v3 with SD staker fee discounts applied
     */
    function withdraw(uint256 shares) external nonReentrant returns (uint256 netPayout) {
        require(shares > 0, "Zero shares");
        require(sharesOf[msg.sender] >= shares, "Insufficient shares");

        uint256 totalA = totalAssets();
        uint256 grossAmount = (shares * totalA) / totalShares;

        totalShares -= shares;
        sharesOf[msg.sender] -= shares;

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

            if (address(discountStaking) != address(0)) {
                uint16 discountBps = discountStaking.getTier(msg.sender);
                effectiveFeeBps = FeeDiscountMath.discountedFee(effectiveFeeBps, discountBps);
            }

            fee = (yieldProfit * effectiveFeeBps) / 10_000;
        }

        netPayout = grossAmount - fee;

        if (address(comet) != address(0) && underlyingAsset.balanceOf(address(this)) < grossAmount) {
            uint256 deficit = grossAmount - underlyingAsset.balanceOf(address(this));
            comet.withdraw(address(underlyingAsset), deficit);
        }

        if (fee > 0 && treasury != address(0)) {
            require(underlyingAsset.transfer(treasury, fee), "Fee transfer failed");
        }

        require(underlyingAsset.transfer(msg.sender, netPayout), "Payout failed");

        emit Withdraw(msg.sender, netPayout, shares, fee);
        return netPayout;
    }
}
