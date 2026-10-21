// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "../src/WeeklyUsdcDistributor.sol";

interface Vm {
    function warp(uint256) external;
    function prank(address) external;
    function expectRevert(bytes calldata) external;
}

contract MockUsdc {
    uint8 public decimals = 6;
    uint256 public transferFeeBps;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 tokenDecimals) {
        decimals = tokenDecimals;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setTransferFee(uint256 feeBps) external {
        transferFeeBps = feeBps;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Allowance");
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) private {
        require(balanceOf[from] >= amount, "Balance");
        uint256 fee = (amount * transferFeeBps) / 10_000;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - fee;
    }
}

contract WeeklyUsdcDistributorTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint64 constant ORIGIN = 1_000_000;
    uint256 constant WEEK = 7 days;

    MockUsdc usdc;
    WeeklyUsdcDistributor distributor;

    address owner = address(0x0A11);
    address alice = address(0xAAAA);
    address bob = address(0xBBBB);
    address carol = address(0xCCCC);
    address relayer = address(0xDDDD);

    uint256 constant ALICE_AMOUNT = 70e6;
    uint256 constant BOB_AMOUNT = 20e6;
    uint256 constant CAROL_AMOUNT = 10e6;
    uint256 constant TOTAL = ALICE_AMOUNT + BOB_AMOUNT + CAROL_AMOUNT;
    bytes32 constant LEDGER = keccak256("epoch ledger");

    function setUp() public {
        vm.warp(ORIGIN);
        usdc = new MockUsdc(6);
        distributor = new WeeklyUsdcDistributor(address(usdc), owner, ORIGIN);
        usdc.mint(owner, 1_000e6);
        vm.prank(owner);
        usdc.approve(address(distributor), type(uint256).max);
    }

    // --- Merkle helpers: same leaf and sorted-pair rules as src/lib/rewards.ts ---

    function _leaf(uint256 epochId, address account, uint256 amount) internal view returns (bytes32) {
        return keccak256(
            bytes.concat(keccak256(abi.encode(block.chainid, address(distributor), epochId, account, amount)))
        );
    }

    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encodePacked(a, b)) : keccak256(abi.encodePacked(b, a));
    }

    /// Tree for [alice, bob, carol]: root = H(H(alice, bob), carol).
    function _tree(uint256 epochId)
        internal
        view
        returns (bytes32 root, bytes32[] memory aliceProof, bytes32[] memory bobProof, bytes32[] memory carolProof)
    {
        bytes32 a = _leaf(epochId, alice, ALICE_AMOUNT);
        bytes32 b = _leaf(epochId, bob, BOB_AMOUNT);
        bytes32 c = _leaf(epochId, carol, CAROL_AMOUNT);
        bytes32 ab = _pair(a, b);
        root = _pair(ab, c);
        aliceProof = new bytes32[](2);
        aliceProof[0] = b;
        aliceProof[1] = c;
        bobProof = new bytes32[](2);
        bobProof[0] = a;
        bobProof[1] = c;
        carolProof = new bytes32[](1);
        carolProof[0] = ab;
    }

    function _publish(uint256 epochId, bytes32 root, uint256 allocation) internal {
        vm.warp(uint256(ORIGIN) + epochId * WEEK);
        vm.prank(owner);
        distributor.publishEpoch(epochId, root, LEDGER, allocation);
    }

    // --- Construction ---

    function test_ConstructorRejectsNonSixDecimalToken() public {
        MockUsdc wrong = new MockUsdc(18);
        vm.expectRevert(bytes("Expected 6 decimals"));
        new WeeklyUsdcDistributor(address(wrong), owner, ORIGIN);
    }

    function test_ConstructorRejectsZeroOwnerAndOrigin() public {
        vm.expectRevert(bytes("Invalid address"));
        new WeeklyUsdcDistributor(address(usdc), address(0), ORIGIN);
        vm.expectRevert(bytes("Invalid origin"));
        new WeeklyUsdcDistributor(address(usdc), owner, 0);
    }

    // --- Publication ---

    function test_PublishFundsAllocationAtomically() public {
        (bytes32 root,,,) = _tree(1);
        _publish(1, root, TOTAL);

        (bytes32 storedRoot, bytes32 ledgerHash, uint256 allocated, uint256 claimed) = distributor.epochs(1);
        require(storedRoot == root && ledgerHash == LEDGER, "Epoch identity");
        require(allocated == TOTAL && claimed == 0, "Epoch amounts");
        require(usdc.balanceOf(address(distributor)) == TOTAL, "Not funded");
        require(distributor.totalReserved() == TOTAL, "Reserve");
        require(distributor.lastPublishedEpoch() == 1, "Sequence");
    }

    function test_OnlyOwnerPublishes() public {
        (bytes32 root,,,) = _tree(1);
        vm.warp(uint256(ORIGIN) + WEEK);
        vm.prank(alice);
        vm.expectRevert(bytes("Not owner"));
        distributor.publishEpoch(1, root, LEDGER, TOTAL);
    }

    function test_CannotPublishBeforeEpochEnds() public {
        (bytes32 root,,,) = _tree(1);
        vm.warp(uint256(ORIGIN) + WEEK - 1);
        vm.prank(owner);
        vm.expectRevert(bytes("Epoch not ended"));
        distributor.publishEpoch(1, root, LEDGER, TOTAL);
    }

    function test_EpochsMustBeSequentialAndNotReused() public {
        (bytes32 root,,,) = _tree(2);
        vm.warp(uint256(ORIGIN) + 2 * WEEK);
        vm.prank(owner);
        vm.expectRevert(bytes("Epoch out of sequence"));
        distributor.publishEpoch(2, root, LEDGER, TOTAL);

        _publish(1, bytes32(0), 0);
        vm.prank(owner);
        vm.expectRevert(bytes("Epoch out of sequence"));
        distributor.publishEpoch(1, root, LEDGER, TOTAL);
    }

    function test_EmptyEpochRequiresZeroRootAndLedgerHash() public {
        vm.warp(uint256(ORIGIN) + WEEK);
        vm.prank(owner);
        vm.expectRevert(bytes("Invalid allocation root"));
        distributor.publishEpoch(1, bytes32(0), LEDGER, 1);

        vm.prank(owner);
        vm.expectRevert(bytes("Missing ledger hash"));
        distributor.publishEpoch(1, bytes32(0), bytes32(0), 0);

        _publish(1, bytes32(0), 0);
        require(usdc.balanceOf(address(distributor)) == 0, "Empty epoch moved funds");
    }

    function test_FeeOnTransferFundingReverts() public {
        (bytes32 root,,,) = _tree(1);
        usdc.setTransferFee(1);
        vm.warp(uint256(ORIGIN) + WEEK);
        vm.prank(owner);
        vm.expectRevert(bytes("Funding mismatch"));
        distributor.publishEpoch(1, root, LEDGER, TOTAL);
    }

    // --- Claims ---

    function test_ClaimsPayEachRecipientOnce() public {
        (bytes32 root, bytes32[] memory aliceProof, bytes32[] memory bobProof, bytes32[] memory carolProof) =
            _tree(1);
        _publish(1, root, TOTAL);

        vm.prank(alice);
        distributor.claim(1, alice, ALICE_AMOUNT, aliceProof);
        vm.prank(bob);
        distributor.claim(1, bob, BOB_AMOUNT, bobProof);
        vm.prank(carol);
        distributor.claim(1, carol, CAROL_AMOUNT, carolProof);

        require(usdc.balanceOf(alice) == ALICE_AMOUNT, "Alice payout");
        require(usdc.balanceOf(bob) == BOB_AMOUNT, "Bob payout");
        require(usdc.balanceOf(carol) == CAROL_AMOUNT, "Carol payout");
        require(usdc.balanceOf(address(distributor)) == 0, "Residual balance");
        require(distributor.totalReserved() == 0, "Residual reserve");
        (,,, uint256 claimed) = distributor.epochs(1);
        require(claimed == TOTAL, "Claimed total");

        vm.prank(alice);
        vm.expectRevert(bytes("Already claimed"));
        distributor.claim(1, alice, ALICE_AMOUNT, aliceProof);
    }

    function test_RelayedClaimPaysProvenAccountOnly() public {
        (bytes32 root, bytes32[] memory aliceProof,,) = _tree(1);
        _publish(1, root, TOTAL);

        vm.prank(relayer);
        distributor.claim(1, alice, ALICE_AMOUNT, aliceProof);
        require(usdc.balanceOf(alice) == ALICE_AMOUNT, "Alice not paid");
        require(usdc.balanceOf(relayer) == 0, "Relayer paid");
        require(distributor.hasClaimed(1, alice), "Claim not recorded");
    }

    function test_RejectsWrongAmountAccountOrProof() public {
        (bytes32 root, bytes32[] memory aliceProof, bytes32[] memory bobProof,) = _tree(1);
        _publish(1, root, TOTAL);

        vm.expectRevert(bytes("Invalid proof"));
        distributor.claim(1, alice, ALICE_AMOUNT + 1, aliceProof);
        vm.expectRevert(bytes("Invalid proof"));
        distributor.claim(1, relayer, ALICE_AMOUNT, aliceProof);
        vm.expectRevert(bytes("Invalid proof"));
        distributor.claim(1, alice, ALICE_AMOUNT, bobProof);
        vm.expectRevert(bytes("Invalid claim"));
        distributor.claim(1, alice, 0, aliceProof);
    }

    function test_ProofIsBoundToEpoch() public {
        (bytes32 root1, bytes32[] memory aliceProof1,,) = _tree(1);
        _publish(1, root1, TOTAL);
        (bytes32 root2,,,) = _tree(2);
        _publish(2, root2, TOTAL);

        vm.expectRevert(bytes("Invalid proof"));
        distributor.claim(2, alice, ALICE_AMOUNT, aliceProof1);
        distributor.claim(1, alice, ALICE_AMOUNT, aliceProof1);
        require(!distributor.hasClaimed(2, alice), "Epoch 2 consumed");
    }

    function test_CannotClaimEmptyOrUnpublishedEpoch() public {
        (, bytes32[] memory aliceProof,,) = _tree(1);
        vm.expectRevert(bytes("Epoch not funded"));
        distributor.claim(1, alice, ALICE_AMOUNT, aliceProof);

        _publish(1, bytes32(0), 0);
        vm.expectRevert(bytes("Epoch not funded"));
        distributor.claim(1, alice, ALICE_AMOUNT, aliceProof);
    }

    function test_UnderfundedRootCannotDrainOtherEpochs() public {
        // Epoch 1 is fully funded. Epoch 2's root promises more than its allocation.
        (bytes32 root1,,, bytes32[] memory carolProof1) = _tree(1);
        _publish(1, root1, TOTAL);
        (bytes32 root2, bytes32[] memory aliceProof2, bytes32[] memory bobProof2,) = _tree(2);
        _publish(2, root2, ALICE_AMOUNT);

        distributor.claim(2, alice, ALICE_AMOUNT, aliceProof2);
        vm.expectRevert(bytes("Allocation exceeded"));
        distributor.claim(2, bob, BOB_AMOUNT, bobProof2);

        // Epoch 1 funds remain intact for its recipients.
        distributor.claim(1, carol, CAROL_AMOUNT, carolProof1);
        require(distributor.totalReserved() == ALICE_AMOUNT + BOB_AMOUNT, "Epoch 1 reserve");
    }

    // --- Ownership ---

    function test_TwoStepOwnershipTransfer() public {
        vm.prank(alice);
        vm.expectRevert(bytes("Not owner"));
        distributor.transferOwnership(alice);

        vm.prank(owner);
        distributor.transferOwnership(bob);
        require(distributor.owner() == owner, "Transferred early");

        vm.prank(alice);
        vm.expectRevert(bytes("Not pending owner"));
        distributor.acceptOwnership();

        vm.prank(bob);
        distributor.acceptOwnership();
        require(distributor.owner() == bob && distributor.pendingOwner() == address(0), "Ownership");
    }
}
