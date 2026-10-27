// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MuttProStaking } from "../src/MuttProStaking.sol";
import { MuttRewards } from "../src/MuttRewards.sol";

interface ProVm {
    function prank(address) external;
    function warp(uint256) external;
    function addr(uint256) external returns (address);
    function sign(uint256, bytes32) external returns (uint8, bytes32, bytes32);
}

contract MuttProStakingTest {
    ProVm constant vm = ProVm(address(uint160(uint256(keccak256("hevm cheat code")))));
    MuttRewards token;
    MuttProStaking staking;
    address constant BOB = address(0xB0B);
    address constant EVE = address(0xE7E);
    uint256 constant LOCK = 30 days;
    uint256 constant T0 = 1_800_000_000;
    uint256 constant ALICE_KEY = 0xA11CE;

    function setUp() public {
        vm.warp(T0);
        token = new MuttRewards(address(this));
        staking = new MuttProStaking(IERC20(address(token)), LOCK);
        require(token.transfer(BOB, 1_000_000 ether), "fund bob");
        require(token.transfer(EVE, 1_000_000 ether), "fund eve");
    }

    function _stake(address who, uint256 amount) internal {
        vm.prank(who);
        token.approve(address(staking), amount);
        vm.prank(who);
        staking.stake(amount);
    }

    function testStakeRecordsAndLocks() public {
        _stake(BOB, 9_000 ether);
        require(staking.stakedOf(BOB) == 9_000 ether && staking.totalStaked() == 9_000 ether, "staked");
        require(token.balanceOf(address(staking)) == 9_000 ether, "held");
        require(staking.maturedOf(BOB) == 0, "not matured");
        vm.prank(BOB);
        try staking.withdrawMatured() { revert("withdrew locked"); } catch {}
    }
    function testEachDepositHasItsOwnLock() public {
        _stake(BOB, 9_000 ether);
        vm.warp(T0 + LOCK);
        _stake(BOB, 1_000 ether); // new deposit waits a full lock of its own
        require(staking.maturedOf(BOB) == 9_000 ether, "first matured");
        vm.prank(BOB);
        require(staking.withdrawMatured() == 9_000 ether, "withdraw matured only");
        require(staking.stakedOf(BOB) == 1_000 ether && token.balanceOf(BOB) == 999_000 ether, "balances");
        vm.warp(T0 + 2 * LOCK);
        vm.prank(BOB);
        require(staking.withdrawMatured() == 1_000 ether, "second matured");
        require(staking.stakedOf(BOB) == 0 && staking.totalStaked() == 0, "empty");
        require(staking.depositsOf(BOB).length == 0, "records cleared");
    }
    function testLockedUntilBacksALicenseToItsExpiry() public {
        _stake(BOB, 5_000 ether);
        vm.warp(T0 + 10 days);
        _stake(BOB, 2_000 ether);
        // A license to day 30 is backed by both deposits; to day 35 only by the second.
        require(staking.lockedUntil(BOB, T0 + LOCK) == 7_000 ether, "to day 30");
        require(staking.lockedUntil(BOB, T0 + 35 days) == 2_000 ether, "to day 35");
        require(staking.lockedUntil(BOB, T0 + 41 days) == 0, "past every lock");
    }
    function testRelockKeepsProGoing() public {
        _stake(BOB, 5_000 ether);
        vm.warp(T0 + LOCK + 1);
        require(staking.lockedUntil(BOB, block.timestamp + 1) == 0, "lapsed");
        vm.prank(BOB);
        staking.relockAll();
        require(staking.lockedUntil(BOB, block.timestamp + LOCK) == 5_000 ether, "relocked");
        require(staking.maturedOf(BOB) == 0, "no longer matured");
        vm.prank(EVE);
        try staking.relockAll() { revert("relock with nothing"); } catch {}
    }
    function testOnlyTheDepositorCanTakeTheirStake() public {
        _stake(BOB, 5_000 ether);
        vm.warp(T0 + LOCK);
        vm.prank(EVE);
        try staking.withdrawMatured() { revert("eve took bob's stake"); } catch {}
        require(staking.stakedOf(BOB) == 5_000 ether, "untouched");
    }
    function testHasNoOwnerPauseOrSweep() public {
        string[6] memory sigs = ["owner()", "pause()", "setLockDuration(uint256)", "sweep(address)",
            "emergencyWithdraw()", "rescueTokens(address,uint256)"];
        for (uint256 i; i < sigs.length; i++) {
            (bool ok,) = address(staking).call(abi.encodeWithSignature(sigs[i]));
            require(!ok, sigs[i]);
        }
    }
    function testDepositCapAndBadInputs() public {
        vm.prank(BOB);
        token.approve(address(staking), type(uint256).max);
        for (uint256 i; i < 32; i++) {
            vm.prank(BOB);
            staking.stake(1 ether);
        }
        vm.prank(BOB);
        try staking.stake(1 ether) { revert("33rd deposit"); } catch {}
        vm.prank(BOB);
        try staking.stake(0) { revert("zero stake"); } catch {}
        try new MuttProStaking(IERC20(address(token)), 1 hours) { revert("lock too short"); } catch {}
        try new MuttProStaking(IERC20(address(token)), 400 days) { revert("lock too long"); } catch {}
        try new MuttProStaking(IERC20(address(0)), LOCK) { revert("zero token"); } catch {}
        // After maturing, withdrawing frees the slots again.
        vm.warp(T0 + LOCK);
        vm.prank(BOB);
        staking.withdrawMatured();
        vm.prank(BOB);
        staking.stake(1 ether);
    }

    function _permit(address owner, uint256 value, uint256 deadline) internal returns (uint8, bytes32, bytes32) {
        bytes32 typehash =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(typehash, owner, address(staking), value, token.nonces(owner), deadline));
        return vm.sign(ALICE_KEY, keccak256(abi.encodePacked("\x19\x01", token.DOMAIN_SEPARATOR(), structHash)));
    }

    function testStakeWithPermitInOneTransaction() public {
        address alice = vm.addr(ALICE_KEY);
        require(token.transfer(alice, 100 ether), "fund");
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(alice, 60 ether, deadline);
        vm.prank(alice);
        staking.stakeWithPermit(60 ether, deadline, v, r, s);
        require(staking.stakedOf(alice) == 60 ether && token.balanceOf(alice) == 40 ether, "staked by permit");
    }
    function testFrontRunPermitDoesNotBlockTheStake() public {
        address alice = vm.addr(ALICE_KEY);
        require(token.transfer(alice, 100 ether), "fund");
        uint256 deadline = block.timestamp + 1 hours;
        (uint8 v, bytes32 r, bytes32 s) = _permit(alice, 60 ether, deadline);
        // Someone copies the signature from the mempool and submits the permit first.
        token.permit(alice, address(staking), 60 ether, deadline, v, r, s);
        vm.prank(alice);
        staking.stakeWithPermit(60 ether, deadline, v, r, s);
        require(staking.stakedOf(alice) == 60 ether, "stake still went through");
    }
    function testFuzzHeldBalanceMatchesStakes(uint64 a, uint64 b, uint32 wait) public {
        uint256 x = uint256(a) + 1;
        uint256 y = uint256(b) + 1;
        _stake(BOB, x);
        _stake(EVE, y);
        vm.warp(T0 + wait);
        if (wait >= LOCK) {
            vm.prank(BOB);
            staking.withdrawMatured();
        }
        uint256 expected = (wait >= LOCK ? 0 : x) + y;
        require(staking.totalStaked() == expected, "total");
        require(token.balanceOf(address(staking)) == expected, "held equals staked");
        require(staking.stakedOf(BOB) + staking.stakedOf(EVE) == expected, "per wallet");
    }
}
