// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CompoundYieldVault} from "../src/CompoundYieldVault.sol";
import {IComet} from "../src/Interfaces.sol";
import {LaunchVaultForkTests} from "./LaunchVaultForkTests.sol";

/// The Compound v3 launchpad vault against the real Base USDC Comet market.
contract CompoundVaultBaseForkTest is LaunchVaultForkTests {
    function _deployVault(address discountStaking, address admin, address treasury) internal override returns (address) {
        return address(new CompoundYieldVault(USDC, COMET, discountStaking, admin, treasury));
    }

    function _recover(uint256 amount) internal override returns (uint256) {
        vm.prank(ADMIN);
        return CompoundYieldVault(address(vault)).emergencyWithdrawFromComet(amount);
    }

    function _recoverAs(address caller, uint256 amount) internal override {
        vm.prank(caller);
        CompoundYieldVault(address(vault)).emergencyWithdrawFromComet(amount);
    }

    function _recoverDirect(uint256 amount) internal override {
        CompoundYieldVault(address(vault)).emergencyWithdrawFromComet(amount);
    }

    function _protocolBalance() internal view override returns (uint256) {
        return IComet(COMET).balanceOf(address(vault));
    }

    function testMarketAddressesAreFixed() public view {
        CompoundYieldVault v = CompoundYieldVault(address(vault));
        require(address(v.comet()) == COMET, "canonical Comet");
        require(IComet(COMET).baseToken() == USDC, "Comet base asset is USDC");
        require(address(v.discountStaking()) == address(staking), "linked staking");
    }

    function testConstructorRejectsZeroAddresses() public override {
        address s = address(staking);
        try new CompoundYieldVault(address(0), COMET, s, ADMIN, ADMIN) { revert("asset"); } catch {}
        try new CompoundYieldVault(USDC, address(0), s, ADMIN, ADMIN) { revert("comet"); } catch {}
        try new CompoundYieldVault(USDC, COMET, address(0), ADMIN, ADMIN) { revert("staking"); } catch {}
        try new CompoundYieldVault(USDC, COMET, s, address(0), ADMIN) { revert("admin"); } catch {}
        try new CompoundYieldVault(USDC, COMET, s, ADMIN, address(0)) { revert("treasury"); } catch {}
    }
}
