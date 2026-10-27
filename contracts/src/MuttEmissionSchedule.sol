// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { MuttIncentiveScheduler } from "./MuttIncentiveScheduler.sol";

/**
 * @title MuttEmissionSchedule
 * @notice The Mutt Rewards emission curve (whitepaper v2.0 §14.2) as scheduler periods.
 *
 *         The economic model (v0.4) emits the 600 billion MRWD reserve over 48 months on a straight
 *         line from 1.5× the monthly average in month 1 to 0.5× in month 48. The staker pays a flat
 *         rate within an incentive, so the line is cut into 16 back-to-back quarterly periods; each
 *         quarter's amount is the model's emissions for its three months, which keeps every month
 *         within about 4.3% of the curve. Quarter k (0-based) receives
 *         RESERVE × (417 − 18k) / 4512; the numerators sum to exactly 4512, and the few wei lost to
 *         rounding are added to the first quarter so the periods total the reserve exactly.
 */
library MuttEmissionSchedule {
    uint256 internal constant PERIODS = 16;
    /// @dev 91.25 days: sixteen quarters span exactly four 365-day years.
    uint64 internal constant PERIOD_LENGTH = 7_884_000;
    uint256 internal constant RESERVE = 600_000_000_000 ether;

    function build(uint64 firstStart) internal pure returns (MuttIncentiveScheduler.Period[] memory s) {
        s = new MuttIncentiveScheduler.Period[](PERIODS);
        uint256 total;
        for (uint256 k; k < PERIODS; k++) {
            uint256 amount = (RESERVE * (417 - 18 * k)) / 4512;
            uint64 start = firstStart + uint64(k) * PERIOD_LENGTH;
            s[k] = MuttIncentiveScheduler.Period(uint128(amount), start, start + PERIOD_LENGTH);
            total += amount;
        }
        s[0].amount += uint128(RESERVE - total);
    }
}
