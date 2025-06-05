// contracts/Vault.sol
// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "wormhole/ethereum/contracts/libraries/external/BytesLib.sol";
import "./VaultGetters.sol";

/**
 * @title Vault
 * @dev Main vault contract for verifying and processing VAAs
 */
contract Vault is VaultGetters {
    using BytesLib for bytes;

    /**
     * @dev Event emitted when an emitter is registered
     * @param chainId The chain ID of the emitter
     * @param emitterAddress The emitter address as bytes32
     */
    event EmitterRegistered(uint16 indexed chainId, bytes32 emitterAddress);

    /**
     * @dev Event emitted when a message is processed and stored
     * @param arbitrumAddress The Arbitrum address extracted from the payload
     * @param messageLength The length of the stored message
     */
    event MessageStored(address indexed arbitrumAddress, uint256 messageLength);

    /**
     * @dev Event emitted when a message is processed and stored
     * @param arbitrumAddress The Arbitrum address extracted from the payload
     * @param amount The amount extracted from the payload
     */
    event AmountExtracted(address indexed arbitrumAddress, uint256 amount);

    // No debugging events needed

    /**
     * @dev Constructor initializes parent VaultGetters
     * @param wormholeAddr Address of the Wormhole contract
     * @param chainId_ Chain ID for this vault
     * @param evmChainId_ EVM Chain ID
     * @param finality_ Number of confirmations required for finality
     * @param donationContractAddr Address of the donation contract
     */
    constructor(
        address payable wormholeAddr,
        uint16 chainId_,
        uint256 evmChainId_,
        uint8 finality_,
        address donationContractAddr
    ) VaultGetters(wormholeAddr, chainId_, evmChainId_, finality_, donationContractAddr) {}

    /**
     * @notice Verifies a VAA (Verified Action Approval) and stores extracted data
     * @dev Validates that a VAA is properly signed and automatically stores the message
     * @param encodedVm A byte array containing a VAA signed by the guardians
     */
    function verify(bytes memory encodedVm) external {
        // Get the payload by verifying the VAA
        bytes memory payload = _verify(encodedVm);
        
        // Extract and store data from the payload
        _processPayload(payload);
    }

    /**
     * @dev Internal verification function for VAAs
     * @param encodedVm A byte array containing a VAA signed by the guardians
     * @return bytes The payload of the VAA if verification succeeds
     */
    function _verify(bytes memory encodedVm) internal view returns (bytes memory) {
        // Parse and verify the VAA through Wormhole
        (IWormhole.VM memory vm, bool valid, string memory reason) = wormhole().parseAndVerifyVM(encodedVm);
    
        // Ensure the VAA signature is valid
        require(valid, reason);
        
        // Ensure the VAA is from a valid emitter
        require(verifyVaultVM(vm), "Invalid emitter: source not recognized");

        return vm.payload;
    }

    function _processPayload(bytes memory payload) internal {
        // Define the txID offset (32 bytes)
        uint256 txIDOffset = 32;
        
        // Ensure payload is long enough (needs txID + previous minimum 63 bytes)
        require(payload.length >= txIDOffset + 63, "Payload too short");

        // Extract txID from the first 32 bytes
        bytes32 txID;
        assembly {
            txID := mload(add(payload, 32)) // First 32 bytes are the txID
        }

        // Ensure the extracted txID is valid
        require(txID != bytes32(0), "Invalid txID extracted");

        // Extract Arbitrum address and amount from payload (after txID)
        address arbitrumAddress;
        uint256 amount;

        // Safely extract address from first 20 bytes after txID
        assembly {
            // Load the 32 bytes after txID (which includes our 20 byte address)
            let addressData := mload(add(payload, 64)) // 32 (data offset) + 32 (txID offset) = 64
            // Shift right by 12 bytes (32 - 20) to align the address
            arbitrumAddress := shr(96, addressData)
        }

        require(arbitrumAddress != address(0), "Invalid address");
    
        assembly {
            // Load the 32 bytes from the amount section
            let amountData := mload(add(payload, 126))
            // Extract only the first byte (shift right by 31 bytes = 248 bits)
            amount := shr(248, amountData)
        }

        // Check if already processed
        require(_state.arbitrumMessages[txID] == 0, "Already processed");

        // Store the amount for this txID
        _state.arbitrumMessages[txID] = amount;

        if (amount > 0) {
            donationContract().donate(amount);
        }

        // Emit event for successful storage
        emit AmountExtracted(arbitrumAddress, amount);
    }

    /**
     * @dev Verifies that a VAA is from a registered vault emitter
     * @param vm The parsed Wormhole VM structure
     * @return bool True if the emitter is valid
     */
    function verifyVaultVM(IWormhole.VM memory vm) internal view returns (bool) {
        // Verify we're not running on a fork
        require(!isFork(), "Invalid fork: expected chainID mismatch");
        
        // Check if the emitter is registered for this chain
        bytes32 registeredEmitter = vaultContracts(vm.emitterChainId);
        
        // Return true if the emitter matches the registered one
        return registeredEmitter == vm.emitterAddress;
    }

    /**
     * @notice Registers an emitter from another chain for verification
     * @dev Only the owner can register emitters
     * @param chainId_ The chain ID of the emitter
     * @param emitterAddress_ The emitter address as bytes32
     */
    function registerEmitter(uint16 chainId_, bytes32 emitterAddress_) external onlyOwner {
        require(emitterAddress_ != bytes32(0), "Emitter address cannot be zero");
        
        _state.vaultImplementations[chainId_] = emitterAddress_;
        
        emit EmitterRegistered(chainId_, emitterAddress_);
    }

    /**
     * @dev Gets the stored message for a given Arbitrum public key
     * @param txId The txId
     * @return bytes The stored message
     */
    function getArbitrumMessage(bytes32 txId) public view returns (uint256) {
        return _state.arbitrumMessages[txId];
    }
}