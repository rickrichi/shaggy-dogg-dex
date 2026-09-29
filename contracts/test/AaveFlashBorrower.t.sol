// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AaveFlashBorrower} from "../src/AaveFlashBorrower.sol";

interface Vm {
    function prank(address sender) external;
}

abstract contract TestBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertEq(address left, address right, string memory message) internal pure {
        require(left == right, message);
    }
}

contract AaveFlashBorrowerTest is TestBase {
    function testConstructorSetsAdminAndPool() external {
        address dummyPool = address(0x1111);
        address admin = address(0x2222);

        AaveFlashBorrower borrower = new AaveFlashBorrower(dummyPool, admin);

        assertEq(borrower.aavePool(), dummyPool, "pool mismatch");
        assertEq(borrower.admin(), admin, "admin mismatch");
    }

    function testAdminCanUpdatePool() external {
        address dummyPool = address(0x1111);
        address admin = address(0x2222);
        address newPool = address(0x3333);

        AaveFlashBorrower borrower = new AaveFlashBorrower(dummyPool, admin);

        vm.prank(admin);
        borrower.setAavePool(newPool);

        assertEq(borrower.aavePool(), newPool, "updated pool mismatch");
    }
}
