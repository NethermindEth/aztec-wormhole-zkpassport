// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;
import {VaultGetters} from "../src/VaultGetters.sol";
import {Vault} from "../src/Vault.sol";
import {IDonation} from "../Interfaces/IDonation.sol";
import {Donation} from "../src/Donation.sol";
import "forge-std/Script.sol";
import "forge-std/console.sol";

contract DeployVault is Script {
    function run() public returns (address vaultAddress, address vaultGettersAddress, address donationContractAddress) {
        // Parameters for initialization - adjust as needed
        address payable wormholeAddress = payable(0xC89Ce4735882C9F0f0FE26686c53074E09B0D550); // Replace with your wormhole address
        uint16 chainId = 10003; // Your destination chain ID
        uint256 evmChainId = block.chainid; // Use actual chain ID to avoid fork issues
        uint8 finality = 2; 
        
        // Emitter registration info
        bytes32 emitterAddress = hex"3078306266326435633334396335373365396562393536366565626661363863";
        uint16 emitterChainId = 52; // Source chain ID

        vm.startBroadcast();

        // Deploy Donation contract
        Donation donation = new Donation(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        IDonation donationContract = IDonation(address(donation));
        donationContractAddress = address(donationContract);
        
        // Deploy VaultGetters
        VaultGetters vaultGetters = new VaultGetters(
            wormholeAddress,
            chainId, 
            evmChainId,
            finality,
            donationContractAddress
        );
        console.log("VaultGetters deployed to: %s", address(vaultGetters));
        
        // Deploy Vault
        Vault vault = new Vault(
            wormholeAddress,
            chainId, 
            evmChainId,
            finality,
            donationContractAddress
        );
        console.log("Vault deployed to: %s", address(vault));
        
        // Register emitter
        vault.registerEmitter(emitterChainId, emitterAddress);
        console.log("Registered emitter for chain %d", emitterChainId);
        
        vm.stopBroadcast();
        
        return (address(vault), address(vaultGetters), donationContractAddress);
    }
}