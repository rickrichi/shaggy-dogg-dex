// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin v5.x imports
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {ERC20Votes} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Votes.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";

/**
 * @title ShaggyDoggToken
 * @notice Governance token with capped supply, mint/burn, role-based pause, EIP-2612 permits, and ERC20Votes (EIP-5805).
 * @dev OpenZeppelin v5.x pattern. All token state changes are blocked while paused.
 */
contract ShaggyDoggToken is ERC20, ERC20Permit, ERC20Votes, AccessControl, Pausable {
    // --- Constants ---
    uint256 public constant MAX_SUPPLY = 1_000_000_000e18;
    string public constant VERSION = "1.0.0";

    // --- Roles ---
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- Custom errors ---
    error ErrZeroAddress();
    error ErrZeroAmount();
    error ExceedsMaxSupply();
    error ErrInsufficientBalance();

    // --- Events (Pausable already emits Paused/Unpaused) ---
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        address initialAdmin,
        address initialMinter,
        uint256 initialMint
    )
        ERC20(name_, symbol_)
        ERC20Permit(name_) // EIP-712 domain separators keyed by name
    {
        if (initialAdmin == address(0) || initialMinter == address(0)) revert ErrZeroAddress();
        if (initialMint > MAX_SUPPLY) revert ExceedsMaxSupply();

        _grantRole(DEFAULT_ADMIN_ROLE, initialAdmin);
        _grantRole(MINTER_ROLE, initialMinter);
        _grantRole(PAUSER_ROLE, initialAdmin);

        if (initialMint > 0) {
            _mint(initialAdmin, initialMint);
            emit Mint(initialAdmin, initialMint);
        }
    }

    // --- Mint/Burn ---

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert ErrZeroAddress();
        if (amount == 0) revert ErrZeroAmount();
        if (totalSupply() + amount > MAX_SUPPLY) revert ExceedsMaxSupply();

        _mint(to, amount);
        emit Mint(to, amount);
    }

    function burn(uint256 amount) external {
        if (amount == 0) revert ErrZeroAmount();
        if (balanceOf(msg.sender) < amount) revert ErrInsufficientBalance();

        _burn(msg.sender, amount);
        emit Burn(msg.sender, amount);
    }

    function burnFrom(address from, uint256 amount) external {
        if (from == address(0)) revert ErrZeroAddress();
        if (amount == 0) revert ErrZeroAmount();
        if (balanceOf(from) < amount) revert ErrInsufficientBalance();

        _spendAllowance(from, msg.sender, amount);
        _burn(from, amount);
        emit Burn(from, amount);
    }

    // --- Pause control ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // --- Views ---

    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }

    function canMint(uint256 amount) external view returns (bool) {
        return totalSupply() + amount <= MAX_SUPPLY;
    }

    // --- Required overrides (OZ v5) ---

    /// @dev Gate all state-changing token moves when paused and keep ERC20Votes checkpoints in sync.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Votes)
        whenNotPaused
    {
        super._update(from, to, value);
    }

    /// @dev Resolve multiple inheritance for EIP-712 nonces:
    /// `nonces()` is declared in ERC20Permit and in Votes->Nonces (not ERC20Votes directly).
    function nonces(address owner)
        public
        view
        override(ERC20Permit, Nonces)
        returns (uint256)
    {
        return super.nonces(owner);
    }

    /// @dev AccessControl's ERC165 support.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
