// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/**
 * @title MuttRewards
 * @notice Mutt Rewards (MRWD), the liquidity-rewards token proposed in whitepaper v2.0 §12.
 *         Standard OpenZeppelin ERC-20 with EIP-2612 permit. The whole supply of one trillion
 *         MRWD is minted once, in the constructor, to `recipient`.
 *         No owner, no admin, no mint after construction, no burn, no pause, no transfer fee,
 *         no blacklist, no voting checkpoints, no proxy.
 */
contract MuttRewards is ERC20, ERC20Permit {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000_000 ether;

    constructor(address recipient) ERC20("Mutt Rewards", "MRWD") ERC20Permit("Mutt Rewards") {
        _mint(recipient, TOTAL_SUPPLY);
    }
}
