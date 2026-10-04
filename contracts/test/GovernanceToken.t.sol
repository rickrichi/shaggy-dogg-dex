// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {GovernanceToken} from "../src/GovernanceToken.sol";

interface GtVm { function prank(address) external; }

contract GovernanceTokenTest {
    GtVm constant vm = GtVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    GovernanceToken token;
    address constant BOB = address(0xB0B);
    address constant EVE = address(0xE7E);

    function setUp() public { token = new GovernanceToken("Test", "TST", address(this), address(this), 1_000_000 ether); }

    function testInitialStateAndCap() public view {
        require(token.totalSupply() == 1_000_000 ether && token.balanceOf(address(this)) == 1_000_000 ether, "supply");
        require(token.MAX_SUPPLY() == token.totalSupply() && token.remainingSupply() == 0, "fully minted");
    }
    function testMintAboveCapReverts() public {
        try token.mint(BOB, 1) { revert("minted past cap"); } catch {}
    }
    function testOnlyMinterMints() public {
        vm.prank(EVE);
        try token.mint(EVE, 1) { revert("non-minter minted"); } catch {}
    }
    function testTransferAndInsufficientBalance() public {
        require(token.transfer(BOB, 10 ether), "transfer");
        require(token.balanceOf(BOB) == 10 ether, "bob");
        vm.prank(BOB);
        try token.transfer(EVE, 11 ether) { revert("overdraft"); } catch {}
    }
    function testApproveAndTransferFromConsumesAllowance() public {
        token.approve(BOB, 5 ether);
        vm.prank(BOB);
        require(token.transferFrom(address(this), EVE, 3 ether), "tf");
        require(token.allowance(address(this), BOB) == 2 ether && token.balanceOf(EVE) == 3 ether, "allowance");
        vm.prank(BOB);
        try token.transferFrom(address(this), EVE, 3 ether) { revert("exceeded allowance"); } catch {}
    }
    function testAdminControls() public {
        vm.prank(EVE);
        try token.setMinter(EVE) { revert("non-admin setMinter"); } catch {}
        vm.prank(EVE);
        try token.setAdmin(EVE) { revert("non-admin setAdmin"); } catch {}
        try token.setMinter(address(0)) { revert("zero minter"); } catch {}
        try token.setAdmin(address(0)) { revert("zero admin"); } catch {}
        token.setMinter(BOB);
        token.setAdmin(BOB);
        require(token.minter() == BOB && token.admin() == BOB, "rotated");
        try token.setAdmin(address(this)) { revert("old admin retained rights"); } catch {}
    }
    function testConstructorRejectsZeroRoles() public {
        try new GovernanceToken("x", "x", address(0), address(1), 1) { revert("zero admin"); } catch {}
        try new GovernanceToken("x", "x", address(1), address(0), 1) { revert("zero minter"); } catch {}
    }
    function testFuzzTransferConservesSupply(uint96 amount) public {
        uint256 a = uint256(amount) % (1_000_000 ether);
        require(token.transfer(BOB, a), "t");
        require(token.balanceOf(BOB) + token.balanceOf(address(this)) == token.totalSupply(), "conserved");
    }
}
