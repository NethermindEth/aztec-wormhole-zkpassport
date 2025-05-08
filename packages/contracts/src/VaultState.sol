// contracts/State.sol
// SPDX-License-Identifier: Apache 2

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title VaultStorage
 * @dev Defines the core storage structure for the Vault contract system
 */
contract VaultStorage {
    struct Provider {
        uint16 chainId;
        uint16 governanceChainId;
        uint8 finality;
        bytes32 governanceContract;
    }

struct State {
    address payable wormhole;
    
    Provider provider;

    // Only keep the mappings you actually use
    mapping(address => bool) initializedImplementations;
    
    // Keep this for VAA verification
    mapping(uint16 => bytes32) vaultImplementations;
    
    // EIP-155 Chain ID
    uint256 evmChainId;
}
}

/**
 * @title VaultState
 * @dev Manages the core state for the Vault system and handles ownership
 */
contract VaultState {
    VaultStorage.State internal _state;
    address private immutable _owner;

    /**
     * @dev Constructor to initialize the vault state
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
    ) {
        require(wormholeAddr != address(0), "Wormhole address cannot be zero");
        require(finality_ > 0, "Finality must be greater than zero");
        
        _state.wormhole = wormholeAddr;
        _state.provider.chainId = chainId_;
        _state.evmChainId = evmChainId_;
        _state.provider.finality = finality_;
        _state.initializedImplementations[address(this)] = true;
        
        // Initialize optional governance fields
        _state.provider.governanceChainId = 0;
        _state.provider.governanceContract = bytes32(0);
        
        _owner = msg.sender;
    }

    /**
     * @dev Returns the owner of the contract
     * @return Address of the owner
     */
    function owner() public view returns (address) {
        return _owner;
    }

    /**
     * @dev Modifier that restricts functions to the owner
     */
    modifier onlyOwner() {
        require(msg.sender == _owner, "Caller is not the owner");
        _;
    }
}