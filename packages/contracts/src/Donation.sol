// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BridgeToken.sol";

/**
 * @title Donation
 * @dev zkDonation contract for handling donations
 */
contract Donation is BridgeToken {
    address public receiver;

    event DonationMade(address donor, uint256 amount);

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
    function donate(uint256 amount) external {
        require(amount > 0, "Donation amount must be greater than zero");

        _mint(receiver, amount);

        emit DonationMade(receiver, amount);
    }
}