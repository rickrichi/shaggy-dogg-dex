// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface DexVm {
    function readFile(string calldata) external view returns (string memory);
    function parseJsonBytes(string calldata, string calldata) external pure returns (bytes memory);
    function deal(address, uint256) external;
    function expectRevert() external;
    function warp(uint256) external;
    function createSelectFork(string calldata) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
}
interface V2Factory {
    function getPair(address, address) external view returns (address);
    function createPair(address, address) external returns (address);
    function feeToSetter() external view returns (address);
}
interface V2Router {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256) external returns (uint256,uint256,uint256);
    function removeLiquidity(address,address,uint256,uint256,uint256,address,uint256) external returns (uint256,uint256);
    function getAmountsOut(uint256,address[] calldata) external view returns (uint256[] memory);
    function swapExactTokensForTokens(uint256,uint256,address[] calldata,address,uint256) external returns (uint256[] memory);
}
interface V2Pair {
    function balanceOf(address) external view returns (uint256);
    function approve(address,uint256) external returns (bool);
    function getReserves() external view returns (uint112,uint112,uint32);
}
interface BaseToken {
    function balanceOf(address) external view returns (uint256);
    function approve(address,uint256) external returns (bool);
    function decimals() external view returns (uint8);
    function deposit() external payable;
    function withdraw(uint256) external;
}

/// Exercises the exact published creation bytecode used by the Base deployment UI.
contract OwnDexTest {
    receive() external payable {}
    DexVm constant vm = DexVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    V2Factory factory;
    V2Router router;
    BaseToken constant tokenA = BaseToken(0x4200000000000000000000000000000000000006);
    BaseToken constant tokenB = BaseToken(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);
    function deploy(bytes memory code) internal returns (address deployed) {
        assembly { deployed := create(0, add(code, 32), mload(code)) }
        require(deployed != address(0), "deployment failed");
    }
    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_FORK_RPC_URL", string("https://mainnet.base.org")));
        require(block.chainid == 8453, "Base mainnet fork required");
        require(tokenA.decimals() == 18 && tokenB.decimals() == 6, "unexpected real token metadata");
        string memory json = vm.readFile("../src/config/dex/artifacts.json");
        factory = V2Factory(deploy(abi.encodePacked(vm.parseJsonBytes(json, ".factory.bytecode"), abi.encode(address(this)))));
        router = V2Router(deploy(abi.encodePacked(vm.parseJsonBytes(json, ".router.bytecode"), abi.encode(address(factory), address(0x4200000000000000000000000000000000000006)))));
        // Only the local fork's test account is funded. WETH/USDC are the actual Base contracts.
        // Obtain USDC through the existing Base market; no mock tokens, storage edits or minting USDC.
        vm.deal(address(this), 20 ether);
        tokenA.deposit{value: 10 ether}();
        V2Router referenceRouter = V2Router(0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24);
        tokenA.approve(address(referenceRouter), 2 ether);
        address[] memory path = new address[](2); path[0]=address(tokenA); path[1]=address(tokenB);
        uint256 referenceOutput = referenceRouter.getAmountsOut(2 ether,path)[1];
        referenceRouter.swapExactTokensForTokens(2 ether,referenceOutput,path,address(this),block.timestamp+60);
        tokenA.approve(address(router), type(uint256).max); tokenB.approve(address(router), type(uint256).max);
        uint256 usdcDeposit = tokenB.balanceOf(address(this));
        router.addLiquidity(address(tokenA),address(tokenB),2 ether,usdcDeposit,2 ether,usdcDeposit,address(this),block.timestamp + 60);
    }
    function testFactoryRouterAndLpOwnership() public view {
        require(router.factory() == address(factory), "factory");
        require(factory.feeToSetter() == address(this), "fee admin");
        require(V2Pair(factory.getPair(address(tokenA),address(tokenB))).balanceOf(address(this)) > 0, "LP ownership");
    }
    function testRealBaseWethWrapAndUnwrap() public {
        uint256 initialEth = address(this).balance;
        uint256 initialWeth = tokenA.balanceOf(address(this));
        tokenA.deposit{value: 0.1 ether}();
        require(tokenA.balanceOf(address(this)) == initialWeth + 0.1 ether, "wrap balance");
        tokenA.withdraw(0.1 ether);
        require(tokenA.balanceOf(address(this)) == initialWeth && address(this).balance == initialEth, "unwrap balance");
    }
    function testFuzzSwapPreservesInvariant(uint96 input) public {
        uint256 amount = uint256(input) % 0.1 ether + 1e12;
        address[] memory path = new address[](2); path[0] = address(tokenA); path[1] = address(tokenB);
        V2Pair pair = V2Pair(factory.getPair(path[0], path[1]));
        (uint112 a, uint112 b,) = pair.getReserves();
        uint256 expected = router.getAmountsOut(amount,path)[1];
        uint256 beforeBalance = tokenB.balanceOf(address(this));
        router.swapExactTokensForTokens(amount,expected,path,address(this),block.timestamp + 60);
        (uint112 c, uint112 d,) = pair.getReserves();
        require(uint256(c)*d >= uint256(a)*b, "K decreased");
        require(tokenB.balanceOf(address(this)) - beforeBalance == expected, "quote mismatch");
    }
    function testRejectsSlippageAndExpiredSwap() public {
        address[] memory path = new address[](2); path[0]=address(tokenA); path[1]=address(tokenB);
        uint256 expected = router.getAmountsOut(1 ether,path)[1];
        vm.expectRevert(); router.swapExactTokensForTokens(1 ether,expected+1,path,address(this),block.timestamp+60);
        uint256 expired = block.timestamp;
        vm.warp(expired + 1);
        vm.expectRevert(); router.swapExactTokensForTokens(1 ether,1,path,address(this),expired);
    }
    function testRemoveLiquidityAndRejectDuplicatePair() public {
        V2Pair pair = V2Pair(factory.getPair(address(tokenA),address(tokenB)));
        uint256 lp = pair.balanceOf(address(this)); pair.approve(address(router),lp);
        uint256 beforeA = tokenA.balanceOf(address(this));
        router.removeLiquidity(address(tokenA),address(tokenB),lp,1,1,address(this),block.timestamp+60);
        require(pair.balanceOf(address(this)) == 0 && tokenA.balanceOf(address(this)) > beforeA, "withdrawal failed");
        vm.expectRevert(); factory.createPair(address(tokenB),address(tokenA));
    }
}
