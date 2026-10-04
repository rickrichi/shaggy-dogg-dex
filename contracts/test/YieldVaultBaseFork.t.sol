// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {YieldStakingVault} from "../src/YieldStakingVault.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";

interface YieldVm {
    function createSelectFork(string calldata,uint256) external returns(uint256);
    function envOr(string calldata,string calldata) external returns(string memory);
    function deal(address,uint256) external;
    function prank(address) external;
}
interface RealToken {
    function deposit() external payable;
    function approve(address,uint256) external returns(bool);
    function transfer(address,uint256) external returns(bool);
    function balanceOf(address) external view returns(uint256);
}
interface RealRouter {
    function swapExactTokensForTokens(uint256,uint256,address[] calldata,address,uint256) external returns(uint256[] memory);
}

contract YieldVaultBaseForkTest {
    YieldVm constant vm = YieldVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    RealToken constant usdc = RealToken(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);
    RealToken constant weth = RealToken(0x4200000000000000000000000000000000000006);
    RealToken constant amutt = RealToken(0x41F40BAE5318f2C67a4d04D1dc7a42D53A346Ae7);
    FeeDiscountStaking constant staking = FeeDiscountStaking(0x055BB4eD8d5464C25D71391E940ce53CA30845fC);
    address constant treasury = address(0xFEE);
    YieldStakingVault vault;
    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_FORK_RPC_URL", string("https://mainnet.base.org")), 52144242);
        require(block.chainid == 8453, "Base required");
        vm.deal(address(this), 1 ether);
        weth.deposit{value: 1 ether}();
        address router = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
        weth.approve(router, 1 ether);
        address[] memory path = new address[](2); path[0]=address(weth); path[1]=address(usdc);
        RealRouter(router).swapExactTokensForTokens(1 ether, 200e6, path, address(this), block.timestamp+60);
        vault = new YieldStakingVault(address(usdc),0xA238Dd80C259a72e81d7e4664a9801593F98d1c5,
            0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB,address(staking),address(this),treasury);
        usdc.approve(address(vault), type(uint256).max);
    }
    function testRealAaveSupplyAndWithdraw() public {
        uint256 beforeBalance = usdc.balanceOf(address(this));
        uint256 shares = vault.deposit(100e6);
        // At this pinned block Aave rounds a 100 USDC supply down by two micro-USDC.
        require(shares == 100e6 * 1e6 && vault.totalAssets() >= 100e6-2 && vault.totalAssets() <= 100e6, "Aave deposit");
        vault.withdraw(shares);
        require(usdc.balanceOf(address(this)) >= beforeBalance-4, "Aave withdrawal");
        require(vault.totalShares() == 0, "shares remain");
    }
    function testRealAmuttTierDiscountOnRealUsdcYield() public {
        // Impersonation only affects the local fork. No live wallet signs or spends.
        vm.prank(0x9dC0a2E92cC1f08050D2c5F560A45229CcF47C98);
        amutt.transfer(address(this),10_000 ether);
        amutt.approve(address(staking),10_000 ether);
        staking.stake(10_000 ether);
        require(staking.getTier(address(this)) == 500, "expected live 5% discount");
        uint256 shares = vault.deposit(100e6);
        usdc.transfer(address(vault),10e6);
        uint256 beforeFee = usdc.balanceOf(treasury);
        vault.withdraw(shares);
        uint256 fee = usdc.balanceOf(treasury)-beforeFee;
        require(fee >= 950000-2 && fee <= 950000+2, "10 USDC yield must charge 0.95 USDC");
    }
}
