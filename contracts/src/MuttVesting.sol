// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { VestingWallet } from "@openzeppelin/contracts/finance/VestingWallet.sol";

/**
 * @title MuttVesting
 * @notice Vesting for the Mutt Rewards team and treasury allocations (whitepaper v2.0 §15), one
 *         contract per allocation: nothing for 12 months after `launchTime`, then linear release
 *         over the following 36 months.
 *         OpenZeppelin VestingWallet with its start moved to the end of the cliff, so there is
 *         no lump at the cliff. Anyone may call `release`; tokens always go to the beneficiary.
 *
 *         The beneficiary is fixed: ownership cannot be transferred (so unvested tokens cannot be
 *         sold by handing over the wallet) or renounced (which would strand the tokens).
 */
contract MuttVesting is VestingWallet {
    uint64 public constant CLIFF = 365 days;
    uint64 public constant VESTING = 3 * 365 days;

    error BeneficiaryIsFixed();

    constructor(address beneficiary, uint64 launchTime)
        VestingWallet(beneficiary, launchTime + CLIFF, VESTING)
    { }

    function transferOwnership(address) public pure override {
        revert BeneficiaryIsFixed();
    }

    function renounceOwnership() public pure override {
        revert BeneficiaryIsFixed();
    }
}
