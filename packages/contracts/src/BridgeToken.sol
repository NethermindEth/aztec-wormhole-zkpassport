// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BridgeToken
 * @dev ERC20 Token with OpenZeppelin implementation, mintable by owner only.
 */
contract BridgeToken is ERC20, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 initialSupply
    ) ERC20(name_, symbol_) Ownable(msg.sender){
        _mint(msg.sender, initialSupply);
    }

    /**
     * @notice Mint new tokens (only owner)
     * @param to Address to receive the tokens
     * @param amount Amount to mint (in wei units)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

