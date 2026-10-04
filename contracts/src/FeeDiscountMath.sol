// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

library FeeDiscountMath {
    function discountedFee(uint16 feeBps, uint16 discountBps) internal pure returns (uint16) {
        if (discountBps >= 10_000) return 0;
        return uint16((uint256(feeBps) * (10_000 - discountBps)) / 10_000);
    }
}
