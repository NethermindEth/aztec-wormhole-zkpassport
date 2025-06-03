// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.0;
import {VaultGetters} from "../src/VaultGetters.sol";
import {Vault} from "../src/Vault.sol";
import {IDonation} from "../Interfaces/IDonation.sol";
import {Donation} from "../src/Donation.sol";
import "forge-std/Script.sol";
import "forge-std/console.sol";

contract DeployVault is Script {
    function run() public returns (address vaultAddress, address donationContractAddress) {
        // Parameters for initialization - adjust as needed
        address payable wormholeAddress = payable(0xC89Ce4735882C9F0f0FE26686c53074E09B0D550); // Replace with your wormhole address
        uint16 chainId = 2; // Maintain the same chain ID as current contract for consistency
        uint256 evmChainId = block.chainid; // Use actual chain ID to avoid fork issues
        uint8 finality = 2; 
        
        // Emitter registration info
        bytes32 emitterAddress = hex"036f76ac3a1fc0034310960df7f70bef7b7e10a647dbf870716b307f50aa9d28";
        uint16 emitterChainId = 52; // Source chain ID

        vm.startBroadcast();

        // Deploy Donation contract
        Donation donation = new Donation(0x70997970C51812dc3A010C7d01b50e0d17dc79C8);
        IDonation donationContract = IDonation(address(donation));
        donationContractAddress = address(donationContract);
        
        // Deploy Vault (which already inherits VaultGetters)
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
        
        // Add test function (optional)
        // This would require modifying the Vault contract to include the test function
        
        vm.stopBroadcast();
        
        return (address(vault), donationContractAddress);
    }
}