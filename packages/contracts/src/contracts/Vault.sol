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
     * @dev Constructor initializes parent VaultGetters
     * @param wormholeAddr Address of the Wormhole contract
     * @param chainId_ Chain ID for this vault
     * @param evmChainId_ EVM Chain ID
     * @param finality_ Number of confirmations required for finality
     */
    constructor(
        address payable wormholeAddr,
        uint16 chainId_,
        uint256 evmChainId_,
        uint8 finality_
    ) VaultGetters(wormholeAddr, chainId_, evmChainId_, finality_) {}

    /**
     * @notice Verifies a VAA (Verified Action Approval)
     * @dev Validates that a VAA is properly signed and from a recognized emitter
     * @param encodedVm A byte array containing a VAA signed by the guardians
     */
    function verify(bytes memory encodedVm) external view {
        _verify(encodedVm);
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
}