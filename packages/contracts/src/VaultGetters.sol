// contracts/Getters.sol
// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "wormhole/ethereum/contracts/interfaces/IWormhole.sol";
import "./VaultState.sol";

/**
 * @title VaultGetters
 * @dev Provides accessor functions for vault state values
 */
contract VaultGetters is VaultState {
    /**
     * @dev Constructor initializes parent VaultState
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
    ) VaultState(wormholeAddr, chainId_, evmChainId_, finality_) {}

    /**
     * @dev Checks if a contract implementation has been initialized
     * @param impl The implementation address to check
     * @return bool True if the implementation is initialized
     */
    function isInitialized(address impl) public view returns (bool) {
        return _state.initializedImplementations[impl];
    }

    /**
     * @dev Returns the Wormhole contract instance
     * @return IWormhole interface to the Wormhole contract
     */
    function wormhole() public view returns (IWormhole) {
        return IWormhole(_state.wormhole);
    }

    /**
     * @dev Returns the chain ID for this vault
     * @return uint16 Chain ID value
     */
    function chainId() public view returns (uint16) {
        return _state.provider.chainId;
    }

    /**
     * @dev Returns the EVM chain ID
     * @return uint256 EVM chain ID value
     */
    function evmChainId() public view returns (uint256) {
        return _state.evmChainId;
    }

    /**
     * @dev Checks if the contract is running on a fork
     * @return bool True if running on a fork
     */
    function isFork() public view returns (bool) {
        return evmChainId() != block.chainid;
    }

    /**
     * @dev Gets the vault contract address for a given chain
     * @param chainId_ The chain ID to query
     * @return bytes32 The vault contract address
     */
    function vaultContracts(uint16 chainId_) public view returns (bytes32) {
        return _state.vaultImplementations[chainId_];
    }

    /**
     * @dev Returns the finality requirement
     * @return uint8 Number of confirmations required for finality
     */
    function finality() public view returns (uint8) {
        return _state.provider.finality;
    }
}