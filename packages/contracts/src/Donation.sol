// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BridgeToken.sol";

/**
forge create src/Donation.sol:Donation --rpc-url 127.0.0.1:8545 \
    --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
    --constructor-args 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 
 */

/**
 * @title Donation
 * @dev zkDonation contract for handling donations
 */
contract Donation is BridgeToken {
    address public receiver;

    event DonationMade(address donor, uint128 amount);

    /**
     * @notice Constructor to set the receiver address
     * @param _receiver Address that will receive the donations
     */
    constructor(address _receiver) BridgeToken("ProverToken", "PTZK", 1000000000000000000000) {
        receiver = _receiver;
    }

    /**
     * @notice Donate tokens to the receiver
     * @param amount Amount of tokens to donate (in wei units)
     */
    function donate(uint128 amount) external onlyOwner {
        require(amount > 0, "Donation amount must be greater than zero");

        _mint(receiver, amount);

        emit DonationMade(receiver, amount);
    }
}