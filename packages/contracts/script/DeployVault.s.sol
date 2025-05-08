// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;
import {VaultGetters} from "../src/contracts/VaultGetters.sol";
import {Vault} from "../src/contracts/Vault.sol";
import "forge-std/Script.sol";
import "forge-std/console.sol";

contract DeployVault is Script {
    function run() public returns (address vaultAddress, address vaultGettersAddress) {
        // Parameters for initialization - adjust as needed
        address payable wormholeAddress = payable(0xC89Ce4735882C9F0f0FE26686c53074E09B0D550); // Replace with your wormhole address
        uint16 chainId = 10003; // Your destination chain ID
        uint256 evmChainId = block.chainid; // Use actual chain ID to avoid fork issues
        uint8 finality = 2; 
        
        // Emitter registration info
        bytes32 emitterAddress = hex"3078316233353838346638626139333731343139643030616532323864613966";
        uint16 emitterChainId = 52; // Source chain ID

        vm.startBroadcast();
        
        // Deploy VaultGetters
        VaultGetters vaultGetters = new VaultGetters(
            wormholeAddress,
            chainId, 
            evmChainId,
            finality
        );
        console.log("VaultGetters deployed to: %s", address(vaultGetters));
        
        // Deploy Vault
        Vault vault = new Vault(
            wormholeAddress,
            chainId, 
            evmChainId,
            finality
        );
        console.log("Vault deployed to: %s", address(vault));
        
        // Register emitter
        vault.registerEmitter(emitterChainId, emitterAddress);
        console.log("Registered emitter for chain %d", emitterChainId);
        
        vm.stopBroadcast();
        
        return (address(vault), address(vaultGetters));
    }
}