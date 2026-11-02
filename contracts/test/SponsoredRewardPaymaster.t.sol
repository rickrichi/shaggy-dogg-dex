// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {PackedUserOperation, IPaymaster} from "@openzeppelin/contracts/interfaces/IERC4337.sol";
import {MuttRewards} from "../src/MuttRewards.sol";
import {SponsoredRewardPaymaster} from "../src/SponsoredRewardPaymaster.sol";
import {BaseForkSupport} from "./BaseForkSupport.sol";

interface AccountVm {
    struct SignedDelegation {
        uint8 v;
        bytes32 r;
        bytes32 s;
        uint64 nonce;
        address implementation;
    }

    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
    function signAndAttachDelegation(address implementation, uint256 privateKey)
        external
        returns (SignedDelegation memory);
    function prank(address, address) external;
    function prank(address) external;
    function warp(uint256) external;
    function deal(address, uint256) external;
    function expectRevert(bytes calldata) external;
}

/// ERC-4337 EntryPoint v0.7 as deployed on Base.
interface EntryPointV07 {
    struct DepositInfo {
        uint256 deposit;
        bool staked;
        uint112 stake;
        uint32 unstakeDelaySec;
        uint48 withdrawTime;
    }
    error FailedOp(uint256 opIndex, string reason);
    function handleOps(PackedUserOperation[] calldata ops, address payable beneficiary) external;
    function getNonce(address sender, uint192 key) external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function getDepositInfo(address account) external view returns (DepositInfo memory);
}

/// MetaMask's EIP-7702 DeleGator, the account implementation the paymaster accepts.
interface DeleGatorLike {
    struct Execution {
        address target;
        uint256 value;
        bytes callData;
    }
    function execute(Execution calldata) external payable;
    function getPackedUserOperationTypedDataHash(PackedUserOperation calldata) external view returns (bytes32);
}

/// SponsoredRewardPaymaster on a Base fork against the real EntryPoint v0.7 and MetaMask's real
/// 7702 DeleGator: accounts are delegated with a real EIP-7702 authorisation, sign real user
/// operations, and a bundler submits them with handleOps. No mock EntryPoint or account.
contract SponsoredRewardPaymasterTest is BaseForkSupport {
    AccountVm constant cheats = AccountVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    address constant ENTRYPOINT = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address constant ENTRYPOINT_V08 = 0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108;
    address constant DELEGATOR = 0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B;
    address constant BUNDLER = address(0xB0D1E5);
    address constant EVE = address(0xE7E);
    uint256 constant SIGNER_KEY = 0xA11CE;
    uint256 constant ACCOUNT_KEY = 0xACC0;
    uint256 constant SECOND_ACCOUNT_KEY = 0xACC1;

    MuttRewards token;
    SponsoredRewardPaymaster paymaster;
    address account;

    function setUp() public {
        _fork();
        cheats.deal(address(this), 10 ether);
        token = new MuttRewards(address(this));
        paymaster = new SponsoredRewardPaymaster(
            IERC20(address(token)), address(this), cheats.addr(SIGNER_KEY), 100 ether, 0.01 ether
        );
        token.transfer(address(paymaster), 1_000 ether);
        paymaster.deposit{value: 1 ether}(); // real EntryPoint deposit that pays for sponsored gas
        account = _delegate(ACCOUNT_KEY, DELEGATOR);
    }

    /// Delegates the key's address to `implementation` with a signed EIP-7702 authorisation.
    function _delegate(uint256 key, address implementation) internal returns (address who) {
        who = cheats.addr(key);
        cheats.signAndAttachDelegation(implementation, key);
        (bool ok,) = who.call(""); // the authorisation is applied by the next transaction
        ok;
        require(keccak256(who.code) == keccak256(abi.encodePacked(hex"ef0100", implementation)), "delegated");
    }

    function _op(address sender, uint256 key, bytes memory callData, uint48 validUntil, uint128 callGas)
        internal
        returns (PackedUserOperation memory op)
    {
        op.sender = sender;
        op.nonce = EntryPointV07(ENTRYPOINT).getNonce(sender, 0);
        op.callData = callData;
        op.accountGasLimits = bytes32(uint256(300_000) << 128 | uint256(callGas));
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(2 gwei));
        bytes memory header = abi.encodePacked(address(paymaster), uint128(150_000), uint128(80_000));
        op.paymasterAndData = header;
        bytes32 message = paymaster.sponsorshipMessage(op, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = cheats.sign(SIGNER_KEY, MessageHashUtils.toEthSignedMessageHash(message));
        op.paymasterAndData = abi.encodePacked(header, validUntil, r, s, v);
        _signAsAccount(op, key);
    }

    function _signAsAccount(PackedUserOperation memory op, uint256 key) internal {
        bytes32 digest = DeleGatorLike(op.sender).getPackedUserOperationTypedDataHash(op);
        (uint8 v, bytes32 r, bytes32 s) = cheats.sign(key, digest);
        op.signature = abi.encodePacked(r, s, v);
    }

    /// A harmless real call the account makes: read its own MRWD balance.
    function _readBalanceCall(address who) internal view returns (bytes memory) {
        return abi.encodeCall(
            DeleGatorLike.execute,
            (DeleGatorLike.Execution(address(token), 0, abi.encodeCall(IERC20.balanceOf, (who))))
        );
    }

    function _send(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        cheats.prank(BUNDLER, BUNDLER);
        EntryPointV07(ENTRYPOINT).handleOps(ops, payable(BUNDLER));
    }

    function _expectFailedOp(PackedUserOperation memory op, uint256 index, string memory reason) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        cheats.prank(BUNDLER, BUNDLER);
        cheats.expectRevert(abi.encodeWithSelector(EntryPointV07.FailedOp.selector, index, reason));
        EntryPointV07(ENTRYPOINT).handleOps(ops, payable(BUNDLER));
    }

    function _soon() internal view returns (uint48) {
        return uint48(block.timestamp + 5 minutes);
    }

    // ── Real end-to-end sponsorship ─────────────────────────────────────────

    function testRealBundleSponsorsAndRewardsASuccessfulOperation() public {
        uint256 depositBefore = EntryPointV07(ENTRYPOINT).balanceOf(address(paymaster));
        _send(_op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000));
        require(token.balanceOf(account) == 100 ether, "smart account rewarded in MRWD");
        require(paymaster.reservedRewards() == 0, "reservation released");
        require(EntryPointV07(ENTRYPOINT).balanceOf(address(paymaster)) < depositBefore, "paymaster paid the gas");
        require(BUNDLER.balance > 0, "bundler reimbursed by the EntryPoint");
        require(account.balance == 0, "account spent no ETH");
    }

    function testRevertedCallIsSponsoredButNotRewarded() public {
        // The account tries to send MRWD it does not hold, so its call reverts inside handleOps.
        bytes memory failing = abi.encodeCall(
            DeleGatorLike.execute,
            (DeleGatorLike.Execution(address(token), 0, abi.encodeCall(IERC20.transfer, (EVE, 1 ether))))
        );
        uint256 depositBefore = EntryPointV07(ENTRYPOINT).balanceOf(address(paymaster));
        _send(_op(account, ACCOUNT_KEY, failing, _soon(), 200_000));
        require(token.balanceOf(account) == 0, "reverted call not rewarded");
        require(paymaster.reservedRewards() == 0, "reservation released");
        require(EntryPointV07(ENTRYPOINT).balanceOf(address(paymaster)) < depositBefore, "gas still sponsored");
    }

    function testCooldownPreventsRepeatedSponsorship() public {
        _send(_op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000));
        _expectFailedOp(_op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000), 0, "AA34 signature error");
        cheats.warp(block.timestamp + 1 days);
        _send(_op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000));
        require(token.balanceOf(account) == 200 ether, "next-day sponsorship accepted");
    }

    function testRejectsTamperedOverCapExpiredAndPausedOperations() public {
        PackedUserOperation memory op = _op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000);
        op.callData = _readBalanceCall(EVE); // changed after the sponsor signed it
        _signAsAccount(op, ACCOUNT_KEY);
        _expectFailedOp(op, 0, "AA34 signature error");

        // Gas limits that could cost more than maxCostPerOp (0.01 ETH at 2 gwei).
        _expectFailedOp(_op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 5_000_000), 0, "AA34 signature error");

        op = _op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000);
        cheats.warp(block.timestamp + 6 minutes);
        // The paymaster checks expiry itself and reports a signature failure, so the EntryPoint says AA34.
        _expectFailedOp(op, 0, "AA34 signature error");

        paymaster.pause();
        _expectFailedOp(_op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000), 0, "AA34 signature error");
        require(token.balanceOf(account) == 0, "nothing rewarded");
    }

    function testReservationsPreventOvercommitInOneBundle() public {
        paymaster.setRewardAmount(600 ether);
        paymaster.setCooldown(0);
        address second = _delegate(SECOND_ACCOUNT_KEY, DELEGATOR);
        PackedUserOperation[] memory ops = new PackedUserOperation[](2);
        ops[0] = _op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000);
        ops[1] = _op(second, SECOND_ACCOUNT_KEY, _readBalanceCall(second), _soon(), 200_000);
        cheats.prank(BUNDLER, BUNDLER);
        cheats.expectRevert(abi.encodeWithSelector(EntryPointV07.FailedOp.selector, 1, "AA34 signature error"));
        EntryPointV07(ENTRYPOINT).handleOps(ops, payable(BUNDLER));

        _send(_op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000));
        require(token.balanceOf(account) == 600 ether, "one 600 MRWD reward fits the 1,000 MRWD pool");
    }

    function testOwnerCannotWithdrawRewardsReservedForAnInFlightOperation() public {
        paymaster.setRewardAmount(600 ether);
        PackedUserOperation memory op = _op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000);
        // Validation as the real EntryPoint performs it, with the matching postOp still pending.
        cheats.prank(ENTRYPOINT);
        (bytes memory context, uint256 validation) = paymaster.validatePaymasterUserOp(op, keccak256("op"), 0.001 ether);
        require(validation != 1 && paymaster.reservedRewards() == 600 ether, "reward reserved");
        try paymaster.withdrawRewards(address(this), 401 ether) { revert("withdrew reserved"); } catch {}
        paymaster.withdrawRewards(address(this), 400 ether);
        cheats.prank(ENTRYPOINT);
        paymaster.postOp(IPaymaster.PostOpMode.opSucceeded, context, 0, 0);
        require(token.balanceOf(account) == 600 ether, "reserved reward paid");
    }

    function testRejectsAccountsDelegatedToAnotherImplementation() public {
        // A real account delegated to some other contract (here Base's WETH) is refused.
        address foreign = _delegate(SECOND_ACCOUNT_KEY, WETH);
        PackedUserOperation memory op;
        op.sender = foreign;
        op.callData = _readBalanceCall(foreign);
        op.accountGasLimits = bytes32(uint256(300_000) << 128 | uint256(200_000));
        op.gasFees = bytes32(uint256(1 gwei) << 128 | uint256(2 gwei));
        bytes memory header = abi.encodePacked(address(paymaster), uint128(150_000), uint128(80_000));
        op.paymasterAndData = header;
        uint48 validUntil = _soon();
        (uint8 v, bytes32 r, bytes32 s) = cheats.sign(
            SIGNER_KEY, MessageHashUtils.toEthSignedMessageHash(paymaster.sponsorshipMessage(op, validUntil))
        );
        op.paymasterAndData = abi.encodePacked(header, validUntil, r, s, v);
        cheats.prank(ENTRYPOINT);
        (, uint256 validation) = paymaster.validatePaymasterUserOp(op, keccak256("op"), 0.001 ether);
        require(validation == 1, "foreign implementation rejected");
    }

    function testOwnerControlsAndRealEntryPointFunding() public {
        cheats.prank(EVE);
        try paymaster.setRewardAmount(1 ether) { revert("nonowner changed reward"); } catch {}
        cheats.prank(EVE);
        try paymaster.withdrawRewards(EVE, 1 ether) { revert("nonowner withdrew"); } catch {}
        cheats.prank(EVE);
        try paymaster.withdrawDeposit(payable(EVE), 1) { revert("nonowner withdrew deposit"); } catch {}

        paymaster.addStake{value: 0.5 ether}(1 days);
        EntryPointV07.DepositInfo memory info = EntryPointV07(ENTRYPOINT).getDepositInfo(address(paymaster));
        require(info.deposit == 1 ether && info.staked && info.stake == 0.5 ether, "real deposit and stake");
        paymaster.withdrawDeposit(payable(address(this)), 0.25 ether);
        require(EntryPointV07(ENTRYPOINT).balanceOf(address(paymaster)) == 0.75 ether, "deposit withdrawn");

        paymaster.unlockStake();
        try paymaster.withdrawStake(payable(address(this))) { revert("stake withdrawn before delay"); } catch {}
        cheats.warp(block.timestamp + 1 days);
        uint256 before = address(this).balance;
        paymaster.withdrawStake(payable(address(this)));
        require(address(this).balance == before + 0.5 ether, "stake returned after the real delay");
    }

    /// Known issue: SIMPLE_7702_IMPLEMENTATION is whitelisted, but those accounts use EntryPoint v0.8
    /// while this paymaster only answers v0.7, so the real v0.8 EntryPoint is refused.
    function testKnownIssueSimple7702AccountsCannotBeSponsored() public {
        PackedUserOperation memory op = _op(account, ACCOUNT_KEY, _readBalanceCall(account), _soon(), 200_000);
        cheats.prank(ENTRYPOINT_V08);
        cheats.expectRevert(
            abi.encodeWithSelector(bytes4(keccak256("PaymasterUnauthorized(address)")), ENTRYPOINT_V08)
        );
        paymaster.validatePaymasterUserOp(op, keccak256("op"), 0.001 ether);
    }
}
