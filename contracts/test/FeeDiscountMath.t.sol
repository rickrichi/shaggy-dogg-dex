// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {FeeDiscountMath} from "../src/FeeDiscountMath.sol";

contract FeeDiscountMathTest {
    function testConfiguredTiersUseBasisPoints() public pure {
        require(FeeDiscountMath.discountedFee(1000, 500) == 950, "5% discount");
        require(FeeDiscountMath.discountedFee(1000, 1000) == 900, "10% discount");
        require(FeeDiscountMath.discountedFee(1000, 2000) == 800, "20% discount");
        require(FeeDiscountMath.discountedFee(1000, 3000) == 700, "30% discount");
        require(FeeDiscountMath.discountedFee(1000, 10_000) == 0, "full discount");
    }
    function testFuzzDiscountNeverIncreasesFee(uint16 fee, uint16 discount) public pure {
        require(FeeDiscountMath.discountedFee(fee, discount) <= fee);
    }
}
