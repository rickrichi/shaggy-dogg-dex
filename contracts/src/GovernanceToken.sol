// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title GovernanceToken
 * @notice Simple capped ERC20 token with admin + minter roles
 */
contract GovernanceToken {
    // --- ERC20 Data ---
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    uint256 public immutable MAX_SUPPLY;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    // --- Roles ---
    address public admin;
    address public minter;

    // --- Events ---
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event MinterChanged(address indexed newMinter);
    event AdminChanged(address indexed newAdmin);

    constructor(
        string memory _name,
        string memory _symbol,
        address _admin,
        address _minter,
        uint256 initialMint
    ) {
        require(_admin != address(0), "Invalid admin");
        require(_minter != address(0), "Invalid minter");

        name = _name;
        symbol = _symbol;
        admin = _admin;
        minter = _minter;

        MAX_SUPPLY = initialMint;

        // Mint initial supply to admin
        _mint(_admin, initialMint);
    }

    // --- ERC20 View Functions ---

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

    function remainingSupply() external view returns (uint256) {
        return MAX_SUPPLY - totalSupply;
    }

    // --- ERC20 Core Functions ---

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = _allowances[from][msg.sender];
        require(allowed >= amount, "Allowance exceeded");

        _approve(from, msg.sender, allowed - amount);
        _transfer(from, to, amount);
        return true;
    }

    // --- Minting (only minter) ---

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "Not minter");
        _mint(to, amount);
    }

    function setMinter(address newMinter) external {
        require(msg.sender == admin, "Not admin");
        require(newMinter != address(0), "Invalid");
        minter = newMinter;
        emit MinterChanged(newMinter);
    }

    function setAdmin(address newAdmin) external {
        require(msg.sender == admin, "Not admin");
        require(newAdmin != address(0), "Invalid");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }

    // --- Internal Helpers ---

    function _mint(address to, uint256 amount) internal {
        require(totalSupply + amount <= MAX_SUPPLY, "Max supply exceeded");
        _balances[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Zero address");
        require(_balances[from] >= amount, "Balance too low");

        _balances[from] -= amount;
        _balances[to] += amount;

        emit Transfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(spender != address(0), "Zero address");
        require(owner != address(0), "Zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
