// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {GovernanceToken} from "../src/GovernanceToken.sol";

interface V3Vm {
    function createSelectFork(string calldata, uint256) external returns (uint256);
    function envOr(string calldata, string calldata) external returns (string memory);
    function deal(address, uint256) external;
    function expectRevert() external;
}
interface V3Metadata {
    function factory() external view returns (address);
    function WETH9() external view returns (address);
}
interface V3Factory {
    function feeAmountTickSpacing(uint24) external view returns (int24);
    function createPool(address, address, uint24) external returns (address);
}
interface V3Token {
    function approve(address, uint256) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}
interface V3Router {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata) external payable returns (uint256);
    function multicall(uint256, bytes[] calldata) external payable returns (bytes[] memory);
    function refundETH() external payable;
    function unwrapWETH9(uint256, address) external payable;
}
interface V3Quoter {
    struct QuoteParams {
        address tokenIn; address tokenOut; uint256 amountIn; uint24 fee; uint160 sqrtPriceLimitX96;
    }
    function quoteExactInputSingle(QuoteParams calldata) external returns (uint256, uint160, uint32, uint256);
}
interface V3Positions {
    struct CollectParams { uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max; }
    function collect(CollectParams calldata) external payable returns (uint256, uint256);
    struct MintParams {
        address token0; address token1; uint24 fee; int24 tickLower; int24 tickUpper;
        uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min;
        address recipient; uint256 deadline;
    }
    function createAndInitializePoolIfNecessary(address, address, uint24, uint160) external payable returns (address);
    function mint(MintParams calldata) external payable returns (uint256, uint128, uint256, uint256);
    function multicall(bytes[] calldata) external payable returns (bytes[] memory);
    function ownerOf(uint256) external view returns (address);
}

/// @notice All state changes occur on a local pinned fork; no signing or broadcasting.
contract UniswapV3BaseForkTest {
    V3Vm constant vm = V3Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    V3Router constant router = V3Router(0x2626664c2603336E57B271c5C0b26F421741e481);
    V3Quoter constant quoter = V3Quoter(0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a);
    V3Positions constant manager = V3Positions(0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1);

    receive() external payable {}

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_FORK_RPC_URL", string("https://mainnet.base.org")), 52144242);
        require(block.chainid == 8453, "Base required");
        vm.deal(address(this), 2 ether);
    }

    function testCanonicalMetadataAndStandardFeeTiers() public view {
        address[3] memory periphery = [address(router), address(quoter), address(manager)];
        for (uint256 i; i < periphery.length; i++) {
            require(V3Metadata(periphery[i]).factory() == FACTORY, "factory mismatch");
            require(V3Metadata(periphery[i]).WETH9() == WETH, "WETH mismatch");
        }
        require(V3Factory(FACTORY).feeAmountTickSpacing(100) == 1, "100 spacing");
        require(V3Factory(FACTORY).feeAmountTickSpacing(500) == 10, "500 spacing");
        require(V3Factory(FACTORY).feeAmountTickSpacing(3000) == 60, "3000 spacing");
        require(V3Factory(FACTORY).feeAmountTickSpacing(10000) == 200, "10000 spacing");
    }

    function buyUsdc() internal returns (uint256 output) {
        (uint256 quoted,,,) = quoter.quoteExactInputSingle(V3Quoter.QuoteParams(WETH, USDC, 0.01 ether, 500, 0));
        require(quoted > 0, "empty quote");
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(V3Router.exactInputSingle, (
            V3Router.ExactInputSingleParams(WETH, USDC, 500, address(this), 0.01 ether, quoted * 995 / 1000, 0)));
        calls[1] = abi.encodeCall(V3Router.refundETH, ());
        uint256 balanceBefore = address(this).balance;
        router.multicall{value: 0.02 ether}(block.timestamp + 60, calls);
        require(address(this).balance == balanceBefore - 0.01 ether, "unused ETH not refunded");
        output = V3Token(USDC).balanceOf(address(this));
        require(output >= quoted * 995 / 1000, "minimum not delivered");
    }

    function testNativeInputAndNativeOutputSettlement() public {
        uint256 amount = buyUsdc();
        require(V3Token(USDC).approve(address(router), amount), "approve");
        (uint256 quoted,,,) = quoter.quoteExactInputSingle(V3Quoter.QuoteParams(USDC, WETH, amount, 500, 0));
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(V3Router.exactInputSingle, (
            V3Router.ExactInputSingleParams(USDC, WETH, 500, address(2), amount, quoted * 995 / 1000, 0)));
        calls[1] = abi.encodeCall(V3Router.unwrapWETH9, (quoted * 995 / 1000, address(this)));
        uint256 beforeBalance = address(this).balance;
        router.multicall(block.timestamp + 60, calls);
        require(address(this).balance >= beforeBalance + quoted * 995 / 1000, "ETH not delivered");
    }

    function testExpiredAndImpossibleMinimumRevert() public {
        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeCall(V3Router.exactInputSingle, (
            V3Router.ExactInputSingleParams(WETH, USDC, 500, address(this), 0.01 ether, type(uint256).max, 0)));
        vm.expectRevert();
        router.multicall{value: 0.01 ether}(block.timestamp + 60, calls);
        calls[0] = abi.encodeCall(V3Router.exactInputSingle, (
            V3Router.ExactInputSingleParams(WETH, USDC, 500, address(this), 0.01 ether, 1, 0)));
        vm.expectRevert();
        router.multicall{value: 0.01 ether}(block.timestamp - 1, calls);
    }

    function mintPosition(bool precreate) internal {
        GovernanceToken a = new GovernanceToken("A", "A", address(this), address(this), 100 ether);
        GovernanceToken b = new GovernanceToken("B", "B", address(this), address(this), 100 ether);
        (address token0, address token1) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));
        if (precreate) V3Factory(FACTORY).createPool(token0, token1, 10000);
        a.approve(address(manager), 1 ether);
        b.approve(address(manager), 1 ether);
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(V3Positions.createAndInitializePoolIfNecessary, (token0, token1, 10000, uint160(1 << 96)));
        calls[1] = abi.encodeCall(V3Positions.mint, (V3Positions.MintParams(token0, token1, 10000,
            -887200, 887200, 1 ether, 1 ether, 0.995 ether, 0.995 ether, address(this), block.timestamp + 60)));
        bytes[] memory results = manager.multicall(calls);
        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = abi.decode(results[1], (uint256, uint128, uint256, uint256));
        require(manager.ownerOf(tokenId) == address(this) && liquidity > 0, "NFT not delivered");
        require(amount0 >= 0.995 ether && amount1 >= 0.995 ether, "mint minimums");
        V3Token(token0).approve(address(router), 0.01 ether);
        router.exactInputSingle(V3Router.ExactInputSingleParams(token0, token1, 10000,
            address(this), 0.01 ether, 0.009 ether, 0));
        uint256 beforeBalance = V3Token(token0).balanceOf(address(this));
        (uint256 fees0,) = manager.collect(V3Positions.CollectParams(tokenId, address(this),
            type(uint128).max, type(uint128).max));
        require(fees0 > 0 && V3Token(token0).balanceOf(address(this)) == beforeBalance + fees0, "fees not collected");
    }

    function testAtomicInitializeAndProtectedMint() public { mintPosition(false); }
    function testExistingUninitializedPoolCanBeMinted() public { mintPosition(true); }
}
