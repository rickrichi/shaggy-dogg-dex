// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Deploy} from "../src/Deploy.sol";
import {FeeDiscountStaking} from "../src/FeeDiscountStaking.sol";
import {GovernanceToken} from "../src/GovernanceToken.sol";

interface Vm {
    function prank(address sender) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(uint256 left, uint256 right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertEq(address left, address right, string memory message) internal pure {
        require(left == right, message);
    }

    function assertTrue(bool value, string memory message) internal pure {
        require(value, message);
    }
}

contract DeployTest is TestBase {
    uint256 internal constant INITIAL_MINT = 1_000_000 * 10 ** 18;

    function testRunDeploysAndTransfersConfiguredRoles() external {
        Deploy deployment = new Deploy();
        address operator = address(0xA11CE);

        vm.prank(operator);
        (GovernanceToken token, FeeDiscountStaking staking) = deployment.run();

        assertEq(token.balanceOf(operator), INITIAL_MINT, "initial supply was not minted to operator");
        assertEq(staking.admin(), operator, "staking admin was not transferred");
        assertEq(staking.tierAdmin(), operator, "staking tier admin was not transferred");
        assertEq(staking.minimumStakePeriod(), 7 days, "stake period not configured");
        assertEq(staking.withdrawalFeeBps(), 100, "withdrawal fee not configured");
        assertEq(staking.tiersLength(), 4, "tiers not configured");
    }

    function testRunCanOnlyExecuteOnce() external {
        Deploy deployment = new Deploy();
        deployment.run();

        (bool success,) = address(deployment).call(abi.encodeWithSelector(Deploy.run.selector));
        assertTrue(!success, "second deployment unexpectedly succeeded");
    }
}
