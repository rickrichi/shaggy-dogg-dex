// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PackedUserOperation, IPaymaster} from "@openzeppelin/contracts/interfaces/IERC4337.sol";
import {MuttRewards} from "../src/MuttRewards.sol";
import {SponsoredRewardPaymaster} from "../src/SponsoredRewardPaymaster.sol";

interface PaymasterVm {
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function prank(address) external;
    function warp(uint256) external;
    function deal(address, uint256) external;
    function etch(address, bytes calldata) external;
}

contract MockEntryPointStake {
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public stakeOf;

    function depositTo(address account) external payable {
        balanceOf[account] += msg.value;
    }

    function withdrawTo(address payable recipient, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        recipient.transfer(amount);
    }

    function addStake(uint32) external payable {
        stakeOf[msg.sender] += msg.value;
    }

    function unlockStake() external {}

    function withdrawStake(address payable recipient) external {
        uint256 amount = stakeOf[msg.sender];
        stakeOf[msg.sender] = 0;
        recipient.transfer(amount);
    }
}

contract SponsoredRewardPaymasterTest {
    PaymasterVm constant vm = PaymasterVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address constant SMART_ACCOUNT = address(0xB0B);
    address constant EVE = address(0xE7E);
    uint256 constant SIGNER_KEY = 0xA11CE;

    MuttRewards token;
    SponsoredRewardPaymaster paymaster;

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.deal(address(this), 10 ether);
        MockEntryPointStake mock = new MockEntryPointStake();
        vm.etch(ENTRYPOINT, address(mock).code);
        vm.etch(SMART_ACCOUNT, abi.encodePacked(hex"ef0100", paymasterImplementation()));
        token = new MuttRewards(address(this));
        paymaster = new SponsoredRewardPaymaster(
            IERC20(address(token)), address(this), vm.addr(SIGNER_KEY), 100 ether, 0.01 ether
        );
        token.transfer(address(paymaster), 1_000 ether);
    }

    function paymasterImplementation() internal pure returns (address) {
        return 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B;
    }

    function _operation(uint48 validUntil) internal returns (PackedUserOperation memory op) {
        op.sender = SMART_ACCOUNT;
        op.nonce = 1;
        op.initCode = "";
        op.callData = abi.encodeWithSignature("execute(address,uint256,bytes)", address(token), 0, hex"1234");
        op.accountGasLimits = bytes32(uint256(200_000) << 128 | uint256(250_000));
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(2 gwei));
        op.paymasterAndData = abi.encodePacked(address(paymaster), uint128(120_000), uint128(80_000));
        bytes32 message = paymaster.sponsorshipMessage(op, validUntil);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(SIGNER_KEY, MessageHashUtils.toEthSignedMessageHash(message));
        op.paymasterAndData = abi.encodePacked(op.paymasterAndData, validUntil, r, s, v);
    }

    function _validate(PackedUserOperation memory op, uint256 cost)
        internal
        returns (bytes memory context, uint256 validationData)
    {
        vm.prank(ENTRYPOINT);
        return paymaster.validatePaymasterUserOp(op, keccak256("operation"), cost);
    }

    function testSponsorsAndRewardsOnlySuccessfulOperations() public {
        PackedUserOperation memory op = _operation(uint48(block.timestamp + 5 minutes));
        (bytes memory context, uint256 validationData) = _validate(op, 0.001 ether);
        require(context.length > 0 && validationData != 1, "signed operation accepted");
        require(paymaster.reservedRewards() == 100 ether, "reward reserved");

        vm.prank(ENTRYPOINT);
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, context, 0.0005 ether, 1 gwei);
        require(token.balanceOf(SMART_ACCOUNT) == 100 ether, "smart account rewarded");
        require(paymaster.reservedRewards() == 0, "reservation released");

        vm.warp(block.timestamp + 1 days);
        op = _operation(uint48(block.timestamp + 5 minutes));
        (context,) = _validate(op, 0.001 ether);
        vm.prank(ENTRYPOINT);
        paymaster.postOp(IPaymaster.PostOpMode.opReverted, context, 0.0005 ether, 1 gwei);
        require(token.balanceOf(SMART_ACCOUNT) == 100 ether, "reverted call not rewarded");
        require(paymaster.reservedRewards() == 0, "failed operation released reservation");
    }

    function testCooldownPreventsRepeatedSponsorship() public {
        PackedUserOperation memory op = _operation(uint48(block.timestamp + 5 minutes));
        (bytes memory context, uint256 result) = _validate(op, 0.001 ether);
        require(result != 1, "first accepted");
        vm.prank(ENTRYPOINT);
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, context, 0, 0);
        (, result) = _validate(op, 0.001 ether);
        require(result == 1, "same-day sponsorship rejected");
        vm.warp(block.timestamp + 1 days);
        op = _operation(uint48(block.timestamp + 5 minutes));
        (, result) = _validate(op, 0.001 ether);
        require(result != 1, "next-day sponsorship accepted");
    }

    function testRejectsTamperedExpiredOverCapAndPausedOperations() public {
        uint48 validUntil = uint48(block.timestamp + 5 minutes);
        PackedUserOperation memory op = _operation(validUntil);
        op.callData = hex"1234";
        (, uint256 result) = _validate(op, 0.001 ether);
        require(result == 1, "tampered call rejected");

        op = _operation(validUntil);
        (, result) = _validate(op, 0.011 ether);
        require(result == 1, "high gas cost rejected");

        vm.warp(uint256(validUntil) + 1);
        (, result) = _validate(op, 0.001 ether);
        require(result == 1, "expired signature rejected");

        paymaster.pause();
        op = _operation(uint48(block.timestamp + 5 minutes));
        (, result) = _validate(op, 0.001 ether);
        require(result == 1, "paused paymaster rejected");
    }

    function testRejectsAccountsUsingAnotherImplementation() public {
        address foreignAccount = address(0xF0E1);
        vm.etch(foreignAccount, abi.encodePacked(hex"ef0100", address(0xDEAD)));
        PackedUserOperation memory op = _operation(uint48(block.timestamp + 5 minutes));
        op.sender = foreignAccount;
        bytes memory header = abi.encodePacked(address(paymaster), uint128(120_000), uint128(80_000));
        op.paymasterAndData = header;
        uint48 validUntil = uint48(block.timestamp + 5 minutes);
        bytes32 message = paymaster.sponsorshipMessage(op, validUntil);
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(SIGNER_KEY, MessageHashUtils.toEthSignedMessageHash(message));
        op.paymasterAndData = abi.encodePacked(header, validUntil, r, s, v);
        (, uint256 result) = _validate(op, 0.001 ether);
        require(result == 1, "foreign account implementation rejected");
    }

    function testReservationsPreventOvercommitAndOwnerCannotWithdrawReservedRewards() public {
        paymaster.setRewardAmount(600 ether);
        paymaster.setCooldown(0);
        PackedUserOperation memory op = _operation(uint48(block.timestamp + 5 minutes));
        (bytes memory context, uint256 result) = _validate(op, 0.001 ether);
        require(result != 1 && paymaster.reservedRewards() == 600 ether, "first reward reserved");
        (, result) = _validate(op, 0.001 ether);
        require(result == 1, "second reward overcommits pool");
        try paymaster.withdrawRewards(address(this), 401 ether) { revert("withdrew reserved"); } catch {}
        paymaster.withdrawRewards(address(this), 400 ether);
        vm.prank(ENTRYPOINT);
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, context, 0, 0);
        require(token.balanceOf(SMART_ACCOUNT) == 600 ether, "reserved reward paid");
    }

    function testOwnerControlsAndEntryPointFunding() public {
        vm.prank(EVE);
        try paymaster.setRewardAmount(1 ether) { revert("nonowner changed reward"); } catch {}
        vm.prank(EVE);
        try paymaster.withdrawRewards(EVE, 1 ether) { revert("nonowner withdrew"); } catch {}

        paymaster.deposit{value: 1 ether}();
        require(MockEntryPointStake(ENTRYPOINT).balanceOf(address(paymaster)) == 1 ether, "deposit funded");
        paymaster.addStake{value: 0.5 ether}(1 days);
        require(MockEntryPointStake(ENTRYPOINT).stakeOf(address(paymaster)) == 0.5 ether, "stake funded");
        paymaster.withdrawDeposit(payable(address(this)), 0.25 ether);
        require(MockEntryPointStake(ENTRYPOINT).balanceOf(address(paymaster)) == 0.75 ether, "deposit withdrawn");
    }

    receive() external payable {}
}
