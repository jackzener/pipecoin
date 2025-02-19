// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PipeCoin is ERC20Permit, Ownable {
    // 420,690,000,000 tokens with 18 decimals
    uint256 private constant TOTAL_SUPPLY = 420_069_000_000 * 1e18;

    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address treasury
    )
        ERC20(tokenName, tokenSymbol)
        ERC20Permit(tokenSymbol)
        Ownable(msg.sender)
    {
        require(treasury != address(0), "Invalid contract addresses");

        _mint(treasury, TOTAL_SUPPLY);
    }
}