// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface Vm {
    function createSelectFork(string calldata urlOrAlias) external returns (uint256 forkId);
    function envOr(string calldata name, string calldata defaultValue) external returns (string memory value);
}

interface IUniswapV2Router {
    function factory() external view returns (address);
    function WETH() external view returns (address);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

/// @notice Read-only fork verification. It does not impersonate, sign, broadcast, or mutate contracts.
contract AmmForkTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant UNISWAP_V2_FACTORY =
        0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    address private constant UNISWAP_V2_ROUTER =
        0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private constant WETH =
        0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address private constant USDC =
        0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    bool private forkEnabled;

    function setUp() public {
        string memory forkRpcUrl = vm.envOr("AMM_FORK_RPC_URL", "");
        if (bytes(forkRpcUrl).length == 0) return;

        vm.createSelectFork(forkRpcUrl);
        forkEnabled = true;
    }

    function testForkedUniswapV2MetadataMatchesTheConfiguredMainnetProfile() public view {
        if (!forkEnabled) return;

        require(IUniswapV2Router(UNISWAP_V2_ROUTER).factory() == UNISWAP_V2_FACTORY, "router factory mismatch");
        require(IUniswapV2Router(UNISWAP_V2_ROUTER).WETH() == WETH, "router WETH mismatch");
        require(
            IUniswapV2Factory(UNISWAP_V2_FACTORY).getPair(WETH, USDC) != address(0),
            "expected WETH/USDC pair"
        );
    }
}
