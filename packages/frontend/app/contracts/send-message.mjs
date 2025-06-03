// src/send-message.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import EmitterJSON from "./emitter-ZKPassportCredentialEmitter.json" assert { type: "json" };
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const EmitterContractArtifact = loadContractArtifact(EmitterJSON);

const { PXE_URL = 'http://localhost:8090' } = process.env;

// Read verification data passed from the API route
function getVerificationData() {
  if (!process.env.VERIFICATION_DATA) {
    console.log("No verification data found in environment variables");
    return null;
  }
  
  try {
    const encodedData = process.env.VERIFICATION_DATA;
    const jsonStr = Buffer.from(encodedData, 'base64').toString('utf8');
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Error parsing verification data:", error);
    return null;
  }
}

// Convert a string to a Uint8Array of specific length
function stringToUint8Array(str, length) {
  const buf = new Uint8Array(length);
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  
  // Copy as much as we can
  for (let i = 0; i < Math.min(encoded.length, length); i++) {
    buf[i] = encoded[i];
  }
  
  return buf;
}

// Convert hex string address to Uint8Array of 31 bytes (padded with zeros)
function hexAddressToUint8Array(hexAddress) {
  // Remove 0x prefix if present
  if (hexAddress.startsWith('0x')) {
    hexAddress = hexAddress.substring(2);
  }
  
  // Ensure the hex string is the right length (40 characters for 20 bytes)
  if (hexAddress.length !== 40) {
    throw new Error(`Invalid address length: ${hexAddress.length} chars, expected 40`);
  }
  
  // Create a new Uint8Array to hold the address (31 bytes total)
  const addressBytes = new Uint8Array(31);
  addressBytes.fill(0); // Fill with zeros initially
  
  // Convert each pair of hex characters to a byte (first 20 bytes)
  for (let i = 0; i < 20; i++) {
    const byteHex = hexAddress.substring(i*2, i*2+2);
    addressBytes[i] = parseInt(byteHex, 16);
  }
  
  return addressBytes;
}


// Convert chain ID to a 31-byte array in the expected format
function chainIdToUint8Array(chainId) {
  const chainIdBytes = new Uint8Array(31);
  chainIdBytes.fill(0); // Fill with zeros initially
  
  // Place chain ID at the beginning in little-endian format
  chainIdBytes[0] = chainId & 0xff;        // Lower byte (0x14 for 10004)
  chainIdBytes[1] = (chainId >> 8) & 0xff; // Upper byte (0x27 for 10004)
  
  // Add the array index at the end for debugging
  chainIdBytes[30] = 2;  // This is the second array
  
  return chainIdBytes;
}

// Helper function to debug a Uint8Array
function debugArray(name, array) {
  console.log(`${name} - Length: ${array.length}, First 5 bytes: [${Array.from(array.slice(0, 5)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}], as hex: 0x${Buffer.from(array).toString('hex').substring(0, 10)}...`);
}


function createMessageArrays(donationAddress, arbChainId, verificationData) {
  // Create arrays: [donationAddress, arbChainId, msg1, msg2, msg3, msg4, msg5]
  const msgArrays = [donationAddress, arbChainId];
  
  // Create 5 additional arrays for user data
  for (let i = 0; i < 5; i++) {
    const arr = new Uint8Array(31);
    arr.fill(0);
    msgArrays.push(arr);
  }
  
  // Add user data if available (starting from index 2!)
  if (verificationData) {
    try {
      // Message array 2 (index 2): First name
      if (verificationData.firstName) {
        const nameBytes = stringToUint8Array(verificationData.firstName, 31);
        msgArrays[2] = nameBytes; // Now using index 2, not 0
        debugArray("firstName payload", msgArrays[2]);
      }
      
      // Message array 3 (index 3): Document type
      if (verificationData.documentType) {
        const docBytes = stringToUint8Array(verificationData.documentType, 31);
        msgArrays[3] = docBytes; // Now using index 3, not 1
        debugArray("documentType payload", msgArrays[3]);
      }
      
      // Message array 4 (index 4): EU citizen flag
      if (verificationData.isEUCitizen !== undefined) {
        msgArrays[4][0] = verificationData.isEUCitizen ? 1 : 0;
        debugArray("isEUCitizen payload", msgArrays[4]);
      }
      
      // Message array 5 (index 5): Over 18 flag
      if (verificationData.isOver18 !== undefined) {
        msgArrays[5][0] = verificationData.isOver18 ? 1 : 0;
        debugArray("isOver18 payload", msgArrays[5]);
      }
      
      // Message array 6 (index 6): Extra data (all zeros by default)
    } catch (error) {
      console.error("Error adding user data to message arrays:", error);
    }
  }
  
  // For debugging, add a distinctive byte to the end of each array
  for (let i = 0; i < msgArrays.length; i++) {
    msgArrays[i][30] = i + 1;  // Last byte of each array = array index + 1
  }
  
  return msgArrays;
}

async function main() {
  // Get user verification data from environment variable
  const verificationData = getVerificationData();
  
  console.log("Verification data:", verificationData);
  
  // Connect to PXE
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  console.log(`Connected to PXE at ${PXE_URL}`);

  // Get wallets
  const [ownerWallet, receiverWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Receiver address: ${receiverWallet.getAddress()}`);
  
  // Load addresses from file or use hardcoded defaults
  let addresses;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const addressesPath = join(__dirname, 'addresses.json');
    addresses = JSON.parse(readFileSync(addressesPath, 'utf8'));
    console.log("Using addresses from addresses.json:", addresses);
  } catch (error) {
    // Fallback to hardcoded addresses
    addresses = { 
      emitter: "0x054aba4606088823379606da36c8f6c770bcfe1b38ed663256bec4eca8e0125c" 
    };
    console.log("Using hardcoded addresses:", addresses);
  }

  const emitterAddress = AztecAddress.fromString(addresses.emitter);
  console.log(`Using emitter at ${emitterAddress.toString()}`);

  // EXISTING WORMHOLE AND TOKEN CONTRACT ADDRESSES
  const wormhole_address = AztecAddress.fromString("0x2bad1647bcc984833b3eca33a9753f1878a8d81ee8e40ad2e60dd7bbc0840770");
  const token_address = "0x0032b802142cb4f87460882d5ccc2f78a2daabe7a807a8ae214cbb590e3000c3";

  console.log("Getting token contract...");
  const token = await TokenContract.at(token_address, ownerWallet);

  // Use a new nonce
  const token_nonce = 76n;
  console.log(`Using token nonce: ${token_nonce}`);
  
  // First, set up the public auth witness for the Wormhole contract
  const tokenTransferAction = token.methods.transfer_in_public(
    ownerAddress, 
    receiverWallet.getAddress(),
    2n,
    token_nonce  
  ); 

  console.log("Generating public authwit for token transfer...");
  const validateActionInteraction = await ownerWallet.setPublicAuthWit(
    {
      caller: wormhole_address,
      action: tokenTransferAction
    },
    true
  );
  
  await validateActionInteraction.send().wait();
  console.log("Public auth witness set up successfully");

  // Now create the donation action and private auth witness
  const donationAction = token.methods.transfer_in_private(
    ownerWallet.getAddress(),
    receiverWallet.getAddress(),
    6n,
    token_nonce 
  );
  console.log("Generating private authwit for donation...");

  const donationWitness = await ownerWallet.createAuthWit({ 
    caller: emitterAddress, 
    action: donationAction 
  });

  console.log("Getting emitter contract...");
  const contract = await Contract.at(emitterAddress, EmitterContractArtifact, ownerWallet);

  // The vault address we want to appear in the logs
  const targetVaultAddress = "0xd611F1AF9D056f00F49CB036759De2753EfA82c2";
  console.log(`Target vault address: ${targetVaultAddress}`);
  
  // Create arbitrum address and vault address - these are passed directly to the contract
  const vault_address = hexAddressToUint8Array(targetVaultAddress);
  
  const arb_chain_id = 10_004; // Arbitrum chain ID
  const arb_chain_id_as_u8_31 = chainIdToUint8Array(arb_chain_id);
  
  // Create message arrays with user data (5 arrays of 31 bytes each)
  const msgArrays = createMessageArrays(vault_address,arb_chain_id_as_u8_31, verificationData);  

  // Log what's going to be sent
  console.log("About to send transaction with:");
  console.log("- Vault address (20 bytes- padded to 31 bytes)");
  console.log("- Arbitrum ChainID (31 bytes including padding)");
  console.log("- 5 message arrays of 31 bytes each");
  console.log("  The contract will create 8 arrays of 31 bytes total (first 3 for addresses + 5 from us)");
  console.log("  Total bytes in final payload should be: 8 * 31 = 248 bytes");

  console.log("Calling emitter verify_and_publish...");
  
  try {
    const tx = await contract.methods.verify_and_publish(
      msgArrays,            // Message arrays (5 arrays of 31 bytes each)
      wormhole_address,     // Wormhole contract address
      token_address,        // Token contract address
      6n,                   // Amount
      token_nonce           // Token nonce
    ).send({ authWitnesses: [donationWitness] }).wait();

    console.log("Transaction sent! Hash:", tx.txHash);
    console.log("Block number:", tx.blockNumber);
    
    console.log("Transaction completed successfully!");
    
    return tx;
  } catch (txError) {
    console.error("Error sending transaction:", txError);
    if (txError.message) {
      console.error("Error message:", txError.message);
    }
    if (txError.stack) {
      console.error("Error stack:", txError.stack);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`Error in send-message script: ${err}`);
  if (err.stack) {
    console.error("Error stack:", err.stack);
  }
  process.exit(1);
});