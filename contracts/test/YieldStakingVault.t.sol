// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {YieldStakingVault} from "../src/YieldStakingVault.sol";
import {CompoundYieldVault} from "../src/CompoundYieldVault.sol";

interface Vm {
    function prank(address sender) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(address left, address right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertEq(uint256 left, uint256 right, string memory message) internal pure {
        require(left == right, message);
    }
}

contract YieldVaultsTest is TestBase {
    function testYieldStakingVaultInitialization() external {
        address asset = address(0xAAAA);
        address aavePool = address(0xBBBB);
        address aToken = address(0xCCCC);
        address staking = address(0xDDDD);
        address admin = address(0xEEEE);
        address treasury = address(0xFFFF);

        YieldStakingVault vault = new YieldStakingVault(
            asset,
            aavePool,
            aToken,
            staking,
            admin,
            treasury
        );

        assertEq(address(vault.underlyingAsset()), asset, "asset mismatch");
        assertEq(vault.aavePool(), aavePool, "aavePool mismatch");
        assertEq(vault.admin(), admin, "admin mismatch");
        assertEq(vault.treasury(), treasury, "treasury mismatch");
        assertEq(vault.performanceFeeBps(), 1000, "default fee mismatch");
    }

    function testCompoundYieldVaultInitialization() external {
        address asset = address(0xAAAA);
        address comet = address(0xBBBB);
        address staking = address(0xDDDD);
        address admin = address(0xEEEE);
        address treasury = address(0xFFFF);

        CompoundYieldVault cVault = new CompoundYieldVault(
            asset,
            comet,
            staking,
            admin,
            treasury
        );

        assertEq(address(cVault.underlyingAsset()), asset, "asset mismatch");
        assertEq(address(cVault.comet()), comet, "comet mismatch");
        assertEq(cVault.admin(), admin, "admin mismatch");
        assertEq(cVault.treasury(), treasury, "treasury mismatch");
    }
}
