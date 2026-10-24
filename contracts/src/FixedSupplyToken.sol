// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title FixedSupplyToken
 * @notice Plain ERC20 whose entire supply is minted once, in the constructor.
 *         No mint function, no owner, no admin, no pause, no fees, no blacklist.
 */
contract FixedSupplyToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    constructor(string memory _name, string memory _symbol, address recipient, uint256 supply) {
        require(recipient != address(0), "Invalid recipient");
        require(supply > 0, "Zero supply");

        name = _name;
        symbol = _symbol;
        totalSupply = supply;

        _balances[recipient] = supply;
        emit Transfer(address(0), recipient, supply);
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }

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
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "Allowance exceeded");
            _approve(from, msg.sender, allowed - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Zero address");
        require(_balances[from] >= amount, "Balance too low");

        unchecked {
            _balances[from] -= amount;
        }
        _balances[to] += amount;

        emit Transfer(from, to, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        require(spender != address(0), "Zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }
}
