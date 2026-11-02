// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {YieldStakingVault} from "../src/YieldStakingVault.sol";
import {ForkToken} from "./BaseForkSupport.sol";
import {LaunchVaultForkTests} from "./LaunchVaultForkTests.sol";

/// The Aave v3 launchpad vault against the real Base Aave v3 USDC market.
contract YieldVaultBaseForkTest is LaunchVaultForkTests {
    function _deployVault(address discountStaking, address admin, address treasury) internal override returns (address) {
        return address(new YieldStakingVault(USDC, AAVE_POOL, AUSDC, discountStaking, admin, treasury));
    }

    function _recover(uint256 amount) internal override returns (uint256) {
        vm.prank(ADMIN);
        return YieldStakingVault(address(vault)).emergencyWithdrawFromAave(amount);
    }

    function _recoverAs(address caller, uint256 amount) internal override {
        vm.prank(caller);
        YieldStakingVault(address(vault)).emergencyWithdrawFromAave(amount);
    }

    function _recoverDirect(uint256 amount) internal override {
        YieldStakingVault(address(vault)).emergencyWithdrawFromAave(amount);
    }

    function _protocolBalance() internal view override returns (uint256) {
        return ForkToken(AUSDC).balanceOf(address(vault));
    }

    function testMarketAddressesAreFixed() public view {
        YieldStakingVault v = YieldStakingVault(address(vault));
        require(v.aavePool() == AAVE_POOL && v.aToken() == AUSDC, "canonical Aave market");
        require(address(v.discountStaking()) == address(staking), "linked staking");
    }

    function testConstructorRejectsZeroAddresses() public override {
        address s = address(staking);
        try new YieldStakingVault(address(0), AAVE_POOL, AUSDC, s, ADMIN, ADMIN) { revert("asset"); } catch {}
        try new YieldStakingVault(USDC, address(0), AUSDC, s, ADMIN, ADMIN) { revert("pool"); } catch {}
        try new YieldStakingVault(USDC, AAVE_POOL, address(0), s, ADMIN, ADMIN) { revert("aToken"); } catch {}
        try new YieldStakingVault(USDC, AAVE_POOL, AUSDC, address(0), ADMIN, ADMIN) { revert("staking"); } catch {}
        try new YieldStakingVault(USDC, AAVE_POOL, AUSDC, s, address(0), ADMIN) { revert("admin"); } catch {}
        try new YieldStakingVault(USDC, AAVE_POOL, AUSDC, s, ADMIN, address(0)) { revert("treasury"); } catch {}
    }
}
