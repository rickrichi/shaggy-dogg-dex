// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {FixedSupplyToken} from "../src/FixedSupplyToken.sol";

interface FstVm { function prank(address) external; }

contract FixedSupplyTokenTest {
    FstVm constant vm = FstVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    FixedSupplyToken token;
    address constant BOB = address(0xB0B);
    address constant EVE = address(0xE7E);
    uint256 constant SUPPLY = 1_000_000_000_000 ether;

    function setUp() public { token = new FixedSupplyToken("MuttChow", "MCHOW", address(this), SUPPLY); }

    function testInitialState() public view {
        require(token.totalSupply() == SUPPLY && token.balanceOf(address(this)) == SUPPLY, "supply");
        require(token.decimals() == 18, "decimals");
        require(keccak256(bytes(token.symbol())) == keccak256("MCHOW"), "symbol");
    }
    function testHasNoMintOrAdmin() public {
        (bool okMint,) = address(token).call(abi.encodeWithSignature("mint(address,uint256)", BOB, 1));
        (bool okAdmin,) = address(token).call(abi.encodeWithSignature("admin()"));
        (bool okOwner,) = address(token).call(abi.encodeWithSignature("owner()"));
        require(!okMint && !okAdmin && !okOwner, "privileged function exists");
    }
    function testTransferAndInsufficientBalance() public {
        require(token.transfer(BOB, 10 ether), "transfer");
        require(token.balanceOf(BOB) == 10 ether, "bob");
        vm.prank(BOB);
        try token.transfer(EVE, 11 ether) { revert("overdraft"); } catch {}
        try token.transfer(address(0), 1) { revert("zero recipient"); } catch {}
    }
    function testApproveAndTransferFromConsumesAllowance() public {
        token.approve(BOB, 5 ether);
        vm.prank(BOB);
        require(token.transferFrom(address(this), EVE, 3 ether), "tf");
        require(token.allowance(address(this), BOB) == 2 ether && token.balanceOf(EVE) == 3 ether, "allowance");
        vm.prank(BOB);
        try token.transferFrom(address(this), EVE, 3 ether) { revert("exceeded allowance"); } catch {}
    }
    function testInfiniteAllowanceIsNotConsumed() public {
        token.approve(BOB, type(uint256).max);
        vm.prank(BOB);
        require(token.transferFrom(address(this), EVE, 7 ether), "tf");
        require(token.allowance(address(this), BOB) == type(uint256).max, "max allowance");
    }
    function testConstructorRejectsZeroRecipientAndSupply() public {
        try new FixedSupplyToken("x", "x", address(0), 1) { revert("zero recipient"); } catch {}
        try new FixedSupplyToken("x", "x", address(1), 0) { revert("zero supply"); } catch {}
    }
    function testRejectsSendingTokensToTheTokenContract() public {
        bytes32 reason = keccak256("Transfer to token contract");
        try token.transfer(address(token), 1 ether) { revert("transfer to self accepted"); }
        catch Error(string memory r) { require(keccak256(bytes(r)) == reason, r); }

        token.approve(BOB, 5 ether);
        vm.prank(BOB);
        try token.transferFrom(address(this), address(token), 1 ether) { revert("transferFrom to self accepted"); }
        catch Error(string memory r) { require(keccak256(bytes(r)) == reason, r); }

        require(token.balanceOf(address(token)) == 0, "nothing stuck in the token");
        require(token.balanceOf(address(this)) == SUPPLY, "sender kept everything");
        require(token.allowance(address(this), BOB) == 5 ether, "failed transferFrom spent no allowance");
    }
    function testFuzzTransferConservesSupply(uint96 amount) public {
        uint256 a = uint256(amount) % SUPPLY;
        require(token.transfer(BOB, a), "t");
        require(token.balanceOf(BOB) + token.balanceOf(address(this)) == token.totalSupply(), "conserved");
    }
}
