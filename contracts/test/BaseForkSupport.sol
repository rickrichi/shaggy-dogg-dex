// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FixedSupplyToken} from "../src/FixedSupplyToken.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";
import {Route} from "../src/Interfaces.sol";

/// Foundry cheatcodes used by the Base fork suites.
interface ForkVm {
    function createSelectFork(string calldata, uint256) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
    function deal(address, uint256) external;
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert(bytes calldata) external;
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
}

interface ForkToken {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function deposit() external payable;
}

interface AerodromeRouterLike {
    function swapExactTokensForTokens(uint256, uint256, Route[] calldata, address, uint256)
        external
        returns (uint256[] memory);
    function getAmountsOut(uint256, Route[] calldata) external view returns (uint256[] memory);
    function addLiquidity(address, address, bool, uint256, uint256, uint256, uint256, address, uint256)
        external
        returns (uint256, uint256, uint256);
}

interface V2RouterLike {
    function getAmountsOut(uint256, address[] calldata) external view returns (uint256[] memory);
    function swapExactTokensForTokens(uint256, uint256, address[] calldata, address, uint256)
        external
        returns (uint256[] memory);
    function addLiquidity(address, address, uint256, uint256, uint256, uint256, address, uint256)
        external
        returns (uint256, uint256, uint256);
}

/// Shared Base mainnet fork setup. Every protocol here is the real Base deployment; test
/// accounts get ETH from the fork and buy USDC on Aerodrome. No mock contracts, no storage edits.
abstract contract BaseForkSupport {
    ForkVm internal constant vm = ForkVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    /// Pinned so yield, prices and liquidity are reproducible. Needs an archive-capable RPC.
    uint256 internal constant FORK_BLOCK = 52144242;

    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant WETH = 0x4200000000000000000000000000000000000006;
    address internal constant AAVE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;
    address internal constant AUSDC = 0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB;
    address internal constant COMET = 0xb125E6687d4313864e53df431d5425969c15Eb2F;
    address internal constant UNI_V2_ROUTER = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address internal constant AERO_ROUTER = 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43;
    address internal constant AERO_FACTORY = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da;

    /// Supply and tier schedule of a launchpad token (src/lib/launchpad/settings.ts).
    uint256 internal constant LAUNCH_SUPPLY = 1_000_000e18;

    receive() external payable {}

    function _fork() internal {
        vm.createSelectFork(vm.envOr("BASE_FORK_RPC_URL", string("https://mainnet.base.org")), FORK_BLOCK);
        require(block.chainid == 8453, "Base mainnet fork required");
    }

    function _wrapEth(uint256 amount) internal {
        vm.deal(address(this), address(this).balance + amount);
        ForkToken(WETH).deposit{value: amount}();
    }

    function _aeroRoute(address from, address to) internal pure returns (Route[] memory r) {
        r = new Route[](1);
        r[0] = Route(from, to, false, AERO_FACTORY);
    }

    /// Buys real USDC for `who` on Aerodrome's WETH/USDC volatile pool.
    function _buyUsdc(address who, uint256 ethAmount) internal returns (uint256) {
        _wrapEth(ethAmount);
        ForkToken(WETH).approve(AERO_ROUTER, ethAmount);
        return AerodromeRouterLike(AERO_ROUTER).swapExactTokensForTokens(
            ethAmount, 1, _aeroRoute(WETH, USDC), who, block.timestamp
        )[1];
    }

    /// USDC the market pays for one WETH right now (Aerodrome quote).
    function _wethPriceUsdc() internal view returns (uint256) {
        return AerodromeRouterLike(AERO_ROUTER).getAmountsOut(1e18, _aeroRoute(WETH, USDC))[1];
    }

    /// The token and staking contract a launch creates, with the site's tiers and roles handed to `admin`.
    function _launchTokenAndStaking(address admin)
        internal
        returns (FixedSupplyToken token, FeeDiscountStaking staking)
    {
        token = new FixedSupplyToken("Launch Check", "LNCH", address(this), LAUNCH_SUPPLY);
        staking = new FeeDiscountStaking(address(token), address(this), address(this));
        staking.setTiers(_launchTiers());
        staking.setTierAdmin(admin);
        staking.setAdmin(admin);
    }

    function _launchTiers() internal pure returns (FeeDiscountStaking.Tier[] memory t) {
        t = new FeeDiscountStaking.Tier[](4);
        t[0] = FeeDiscountStaking.Tier(LAUNCH_SUPPLY / 10_000, 1000);
        t[1] = FeeDiscountStaking.Tier(LAUNCH_SUPPLY / 1_000, 2500);
        t[2] = FeeDiscountStaking.Tier(LAUNCH_SUPPLY / 100, 5000);
        t[3] = FeeDiscountStaking.Tier(LAUNCH_SUPPLY / 10, 7500);
    }

    /// Gives `who` the top-tier stake (10% of supply = 75% off vault fees).
    function _stakeTopTier(FixedSupplyToken token, FeeDiscountStaking staking, address who) internal {
        uint256 amount = LAUNCH_SUPPLY / 10;
        token.transfer(who, amount);
        vm.startPrank(who);
        token.approve(address(staking), amount);
        staking.stake(amount);
        vm.stopPrank();
        require(staking.getTier(who) == 7500, "top tier");
    }

    function _near(uint256 a, uint256 b, uint256 tolerance, string memory why) internal pure {
        require(a + tolerance >= b && b + tolerance >= a, why);
    }

    /// Fee charged as basis points of the realised yield, to 0.01 bp.
    function _feeBpsx100(uint256 fee, uint256 profit) internal pure returns (uint256) {
        return profit == 0 ? 0 : (fee * 1_000_000) / profit;
    }
}
