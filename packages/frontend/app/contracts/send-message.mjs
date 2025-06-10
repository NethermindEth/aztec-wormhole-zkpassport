// src/send-message.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import EmitterJSON from "./emitter-ZKPassportCredentialEmitter.json" assert { type: "json" };
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { readFileSync, writeFileSync } from 'fs';
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

// Function to log formatted proofs in detail
function logFormattedProofs(formattedProofs) {
  if (!formattedProofs) {
    console.log("❌ No formatted proofs available");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("🔐 FORMATTED ZK PROOFS FOR CONTRACT");
  console.log("=".repeat(60));

  // Log verification keys
  console.log("\n📋 VERIFICATION KEYS:");
  console.log(`  vkey_a length: ${formattedProofs.vkeys.vkey_a.length}`);
  console.log(`  vkey_b length: ${formattedProofs.vkeys.vkey_b.length}`);
  console.log(`  vkey_c length: ${formattedProofs.vkeys.vkey_c.length}`);
  console.log(`  vkey_d length: ${formattedProofs.vkeys.vkey_d.length}`);

  // Log proofs
  console.log("\n🔑 PROOFS:");
  console.log(`  proof_a length: ${formattedProofs.proofs.proof_a.length}`);
  console.log(`  proof_b length: ${formattedProofs.proofs.proof_b.length}`);
  console.log(`  proof_c length: ${formattedProofs.proofs.proof_c.length}`);
  console.log(`  proof_d length: ${formattedProofs.proofs.proof_d.length}`);

  // Log verification key hashes
  console.log("\n#️⃣ VERIFICATION KEY HASHES:");
  console.log(`  vkey_hash_a: ${formattedProofs.vkey_hashes.vkey_hash_a.toString()}`);
  console.log(`  vkey_hash_b: ${formattedProofs.vkey_hashes.vkey_hash_b.toString()}`);
  console.log(`  vkey_hash_c: ${formattedProofs.vkey_hashes.vkey_hash_c.toString()}`);
  console.log(`  vkey_hash_d: ${formattedProofs.vkey_hashes.vkey_hash_d.toString()}`);

  // Log public inputs
  console.log("\n📊 PUBLIC INPUTS:");
  console.log(`  input_a: [${formattedProofs.public_inputs.input_a.map(x => x.toString()).join(', ')}]`);
  console.log(`  input_b: [${formattedProofs.public_inputs.input_b.map(x => x.toString()).join(', ')}]`);
  console.log(`  input_c: [${formattedProofs.public_inputs.input_c.map(x => x.toString()).join(', ')}]`);
  console.log(`  input_d: [${formattedProofs.public_inputs.input_d.map(x => x.toString()).join(', ')}]`);

  // Log first few elements of each proof and vkey for debugging
  console.log("\n🔍 SAMPLE DATA (first 3 elements):");
  console.log(`  vkey_a sample: [${formattedProofs.vkeys.vkey_a}`);
  console.log(`  vkey_a length: [${formattedProofs.vkeys.vkey_a.length}`);
  console.log(`  proof_a sample: [${formattedProofs.proofs.proof_a.slice(0, 3).map(x => x.toString()).join(', ')}...]`);

  console.log("=".repeat(60) + "\n");
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

  // For debugging, add a distinctive byte to the end of each array
  for (let i = 0; i < msgArrays.length; i++) {
    msgArrays[i][30] = i + 1;  // Last byte of each array = array index + 1
  }
  
  return msgArrays;
}

async function main() {
  // Get user verification data from environment variable
  const verificationData = getVerificationData();
  
  // Extract amount from user data, default to 35 if not provided
  const userAmount = verificationData?.amount || 35;
  console.log(`Using amount from user input: ${userAmount}`);
  
  // Log the formatted proofs if they exist
  if (verificationData?.formattedProofs) {
    logFormattedProofs(verificationData.formattedProofs);
  } else {
    console.log("⚠️  No formatted proofs found in verification data");
  }
  
  // Connect to PXE
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);
  console.log(`Connected to PXE at ${PXE_URL}`);

  // Get wallets
  const [ownerWallet, receiverWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();
  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Receiver address: ${receiverWallet.getAddress()}`);
  
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // Load addresses from file or use hardcoded defaults
  let addresses;
  try {
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
  const wormhole_address = AztecAddress.fromString("0x1320a7c89797e4506b683fcc547acb7f02a809bd1b3a967a3dfe18b7d3f38669");
  const token_address = "0x0dc025163fe73041b970e9a26905fb41358ad14ef8de84e38746679f210d300e";

  console.log("Getting token contract...");
  const token = await TokenContract.at(token_address, ownerWallet);

  const noncePath = join(__dirname, 'nonce.json');
  const nonce_file_data = JSON.parse(readFileSync(noncePath, 'utf8'));

  // Safe BigInt handling
  const current_nonce = nonce_file_data.token_nonce
    ? BigInt(nonce_file_data.token_nonce)
    : 0n;

  const token_nonce = current_nonce + 1n;

  const new_nonce_data = { token_nonce: token_nonce.toString() };

  writeFileSync(noncePath, JSON.stringify(new_nonce_data, null, 2));  
  console.log(`Using token nonce: ${token_nonce}`);
  
  // First, set up the private auth witness for the Wormhole contract
  const tokenTransferAction = token.methods.transfer_in_private(
    ownerAddress, 
    receiverWallet.getAddress(),
    2n,
    token_nonce  
  ); 

  console.log("Generating private authwit for token transfer...");
  const wormholeWitness = await ownerWallet.createAuthWit(
    {
      caller: wormhole_address,
      action: tokenTransferAction
    },
    true
  );

  // Now create the donation action and private auth witness with dynamic amount
  const donationAction = token.methods.transfer_in_private(
    ownerWallet.getAddress(),
    receiverWallet.getAddress(),
    BigInt(userAmount), // Use dynamic amount instead of hardcoded 35n
    token_nonce 
  );
  console.log(`Generating private authwit for donation of ${userAmount} tokens...`);

  const donationWitness = await ownerWallet.createAuthWit({ 
    caller: emitterAddress, 
    action: donationAction 
  });

  console.log("Getting emitter contract...");
  const contract = await Contract.at(emitterAddress, EmitterContractArtifact, ownerWallet);
  
  // The vault address we want to appear in the logs
  const targetVaultAddress = "0x009cbB8f91d392856Cb880d67c806Aa731E3d686";
  console.log(`Target vault address: ${targetVaultAddress}`);
  
  // Create arbitrum address and vault address - these are passed directly to the contract
  const vault_address = hexAddressToUint8Array(targetVaultAddress);
  
  const arb_chain_id = 10_004; // Arbitrum chain ID
  const arb_chain_id_as_u8_31 = chainIdToUint8Array(arb_chain_id);
  
  // Create message arrays with user data (5 arrays of 31 bytes each)
  const msgArrays = createMessageArrays(vault_address, arb_chain_id_as_u8_31, verificationData);  

  // Log what's going to be sent
  console.log("About to send transaction with:");
  console.log("- Vault address (20 bytes- padded to 31 bytes)");
  console.log("- Arbitrum ChainID (31 bytes including padding)");
  console.log(`- Amount: ${userAmount} (from user input)`);
  console.log("- 5 message arrays of 31 bytes each");
  console.log("  The contract will create 8 arrays of 31 bytes total (first 3 for addresses + 5 from us)");
  console.log("  Total bytes in final payload should be: 8 * 31 = 248 bytes");

  // If we have formatted proofs, we could potentially use them here
  // For now, we're just logging them, but you could extend the contract
  // to accept and verify the proofs as well
  if (verificationData?.formattedProofs) {
    console.log("\n🎯 ZK PROOFS READY FOR CONTRACT VERIFICATION");
    console.log("   These proofs could be used for on-chain verification");
    console.log("   if the contract supports ZK proof verification.");
  }

  console.log("Calling emitter verify_and_publish...");
  
  try {
    const tx = await contract.methods.verify_and_publish(
      verificationData?.formattedProofs,
      msgArrays,            // Message arrays (5 arrays of 31 bytes each)
      wormhole_address,     // Wormhole contract address
      token_address,        // Token contract address
      BigInt(userAmount),   // Amount
      token_nonce           // Token nonce
    ).send({ authWitnesses: [wormholeWitness, donationWitness] }).wait();

    console.log("Transaction sent! Hash:", tx.txHash);
    console.log("Block number:", tx.blockNumber);
    
    console.log("Transaction completed successfully!");
    console.log(`✅ Amount ${userAmount} sent successfully via cross-chain transaction`);
    
    // Final summary of what was processed
    if (verificationData?.formattedProofs) {
      console.log("\n✅ SUMMARY:");
      console.log("   - User data sent to contract");
      console.log(`   - Amount ${userAmount} transferred`);
      console.log("   - ZK proofs formatted and logged");
      console.log("   - Ready for future ZK verification integration");
    }
    
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