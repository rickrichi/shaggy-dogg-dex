// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { MuttRewards } from "../src/MuttRewards.sol";

interface MrwdVm {
    function prank(address) external;
    function warp(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

contract MuttRewardsTest {
    MrwdVm constant vm = MrwdVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MuttRewards token;
    address constant BOB = address(0xB0B);
    address constant EVE = address(0xE7E);
    uint256 constant SUPPLY = 1_000_000_000_000 ether;
    uint256 constant ALICE_KEY = 0xA11CE;
    bytes32 constant PERMIT_TYPEHASH = keccak256(
        "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
    );

    function setUp() public { token = new MuttRewards(address(this)); }

    function testInitialState() public view {
        require(token.totalSupply() == SUPPLY && token.TOTAL_SUPPLY() == SUPPLY, "supply");
        require(token.balanceOf(address(this)) == SUPPLY, "recipient holds all");
        require(token.decimals() == 18, "decimals");
        require(keccak256(bytes(token.name())) == keccak256("Mutt Rewards"), "name");
        require(keccak256(bytes(token.symbol())) == keccak256("MRWD"), "symbol");
    }
    function testSupplyFitsUniswapV2Reserves() public pure {
        require(SUPPLY < type(uint112).max, "uint112 reserves");
    }
    function testHasNoPrivilegedOrExtraFunctions() public {
        string[8] memory sigs = [
            "mint(address,uint256)", "burn(uint256)", "burnFrom(address,uint256)", "owner()",
            "admin()", "pause()", "delegate(address)", "upgradeTo(address)"
        ];
        for (uint256 i; i < sigs.length; i++) {
            (bool ok,) = address(token).call(abi.encodeWithSignature(sigs[i]));
            require(!ok, sigs[i]);
        }
    }
    function testConstructorRejectsZeroRecipient() public {
        try new MuttRewards(address(0)) { revert("zero recipient"); } catch {}
    }
    function testTransfersAreStandard() public {
        require(token.transfer(BOB, 10 ether), "transfer");
        require(token.balanceOf(BOB) == 10 ether, "no fee taken");
        vm.prank(BOB);
        try token.transfer(EVE, 11 ether) { revert("overdraft"); } catch {}
        try token.transfer(address(0), 1) { revert("zero recipient"); } catch {}
    }
    function testApproveAndTransferFrom() public {
        token.approve(BOB, 5 ether);
        vm.prank(BOB);
        require(token.transferFrom(address(this), EVE, 3 ether), "tf");
        require(token.allowance(address(this), BOB) == 2 ether && token.balanceOf(EVE) == 3 ether, "allowance");
        vm.prank(BOB);
        try token.transferFrom(address(this), EVE, 3 ether) { revert("exceeded allowance"); } catch {}
    }

    function _permitSig(address owner, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash));
        return vm.sign(ALICE_KEY, digest);
    }

    function testPermitSetsAllowanceBySignature() public {
        address alice = vm.addr(ALICE_KEY);
        require(token.transfer(alice, 100 ether), "fund");
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(alice, BOB, 40 ether, 0, deadline);
        token.permit(alice, BOB, 40 ether, deadline, v, r, s);
        require(token.allowance(alice, BOB) == 40 ether && token.nonces(alice) == 1, "permit");
        vm.prank(BOB);
        require(token.transferFrom(alice, EVE, 40 ether), "spend");
        // The same signature cannot be used twice: the nonce has moved on.
        try token.permit(alice, BOB, 40 ether, deadline, v, r, s) { revert("replayed"); } catch {}
    }
    function testPermitRejectsExpiredAndWrongSigner() public {
        address alice = vm.addr(ALICE_KEY);
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permitSig(alice, BOB, 1 ether, 0, deadline);
        try token.permit(EVE, BOB, 1 ether, deadline, v, r, s) { revert("wrong signer"); } catch {}
        vm.warp(deadline + 1);
        try token.permit(alice, BOB, 1 ether, deadline, v, r, s) { revert("expired"); } catch {}
    }
    function testDomainIsMuttRewardsVersionOne() public view {
        bytes32 expected = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("Mutt Rewards"), keccak256("1"), block.chainid, address(token)
        ));
        require(token.DOMAIN_SEPARATOR() == expected, "domain");
    }
    function testFuzzTransferConservesSupply(uint96 amount) public {
        uint256 a = uint256(amount) % SUPPLY;
        require(token.transfer(BOB, a), "t");
        require(token.balanceOf(BOB) + token.balanceOf(address(this)) == token.totalSupply(), "conserved");
        require(token.totalSupply() == SUPPLY, "supply never changes");
    }
}
