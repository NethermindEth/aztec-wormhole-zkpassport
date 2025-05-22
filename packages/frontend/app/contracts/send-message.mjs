// src/send-message.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { Contract, createPXEClient, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import { readFileSync } from 'fs';
import WormholeJson from "./wormhole_contracts-Wormhole.json" assert { type: "json" };

const WormholeJsonContractArtifact = loadContractArtifact(WormholeJson);

const { PXE_URL = 'http://localhost:8090' } = process.env;

// Get verification data from environment variable if present
let verificationData = null;
const hasMeaningfulData = process.env.HAS_MEANINGFUL_DATA === 'true';

try {
  if (process.env.VERIFICATION_DATA) {
    verificationData = JSON.parse(Buffer.from(process.env.VERIFICATION_DATA, 'base64').toString());
    
    // Debug log all properties
    console.log("Received verification data in script:");
    console.log("- firstName:", verificationData.firstName);
    console.log("- isOver18:", verificationData.isOver18);
    console.log("- isEUCitizen:", verificationData.isEUCitizen);
    console.log("- documentType:", verificationData.documentType);
    console.log("- uniqueIdentifier:", verificationData.uniqueIdentifier);
    console.log("- verified:", verificationData.verified);
    console.log("Has meaningful data:", hasMeaningfulData);
  } else {
    console.log("No verification data provided");
  }
} catch (error) {
  console.error("Error parsing verification data:", error);
}

async function main() {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  // Read the deployed contract address from addresses.json
  let addresses;
  try {
    addresses = JSON.parse(readFileSync('/Users/stavrosvlachakis/AztecProjects/nethermindEth/aztec-wormhole-zkpassport/packages/frontend/app/contracts/addresses.json', 'utf8'));
  } catch (error) {
    console.error("Error reading addresses.json file:", error);
    process.exit(1);
  }
  
  if (!addresses.wormhole) {
    console.error("Wormhole contract address not found in addresses.json");
    process.exit(1);
  }

  console.log("Addresses from addresses.json:", addresses);

  const [ownerWallet] = await getInitialTestAccountsWallets(pxe);

  // Connect to the already deployed contract
  const contract = await Contract.at(addresses.wormhole, WormholeJsonContractArtifact, ownerWallet);
  console.log(`Connected to Wormhole contract at ${addresses.wormhole}`);

  // Prepare message based on verification data
  let message;
  
  // Only use verification data if we have meaningful values
  if (hasMeaningfulData && verificationData) {
    // Create message with verification data
    const messageData = {
      ...verificationData,
      timestamp: new Date().toISOString()
    };
    message = JSON.stringify(messageData);
    console.log(`Sending verification message: ${message}`);
  } else {
    // Fall back to Hello World message
    message = "Hello World";
    console.log(`Sending simple message: ${message}`);
  }

  // Convert message to bytes
  let encoder = new TextEncoder();
  let messageBytes = encoder.encode(message);
  
  // Define a target Ethereum address to be stored with the message
  const targetAddress = "0x94dFeceb91678ec912ef8f14c72721c102ed2Df7";
  
  // Convert the address to bytes (removing 0x prefix and converting to bytes)
  const addressHex = targetAddress.slice(2); // Remove 0x
  const addressBytes = [];
  for (let i = 0; i < addressHex.length; i += 2) {
    addressBytes.push(parseInt(addressHex.substring(i, i + 2), 16));
  }
  
  // Create payloads (8 of them, each 31 bytes)
  const payloads = [];
  
  // First payload contains address + start of message
  let firstPayload = [...addressBytes]; // 20 bytes
  
  // Add as much of the message as will fit in remaining space (11 bytes)
  const firstChunkSize = Math.min(messageBytes.length, 31 - addressBytes.length);
  for (let i = 0; i < firstChunkSize; i++) {
    firstPayload.push(messageBytes[i]);
  }
  
  // Pad to exactly 31 bytes
  while (firstPayload.length < 31) {
    firstPayload.push(0);
  }
  payloads.push(firstPayload);
  
  // If message is longer than what fits in first payload, continue in subsequent payloads
  if (messageBytes.length > firstChunkSize) {
    let messageOffset = firstChunkSize;
    
    // Use up to 7 more payloads for the rest of the message
    for (let i = 1; i < 8 && messageOffset < messageBytes.length; i++) {
      const payload = [];
      
      // Fill this payload with message bytes
      for (let j = 0; j < 31 && messageOffset < messageBytes.length; j++, messageOffset++) {
        payload.push(messageBytes[messageOffset]);
      }
      
      // Pad to exactly 31 bytes
      while (payload.length < 31) {
        payload.push(0);
      }
      
      payloads.push(payload);
    }
  }
  
  // If we haven't used all 8 payloads yet, fill the rest with zeros
  while (payloads.length < 8) {
    payloads.push(Array(31).fill(0));
  }
  
  console.log(`Sending message to address ${targetAddress}`);
  console.log(`Full message bytes: ${messageBytes.length}`);
  
  // Send the message with nonce 100 and consistency level 2
  console.log("Sending transaction...");
  const tx = await contract.methods.publish_message(100, payloads, 1, 2).send();
  
  // Wait for the transaction to be mined
  const receipt = await tx.wait();
  console.log(`Transaction sent! Hash: ${receipt.txHash}`);
  
  // Get the block number to query logs
  const blockNumber = await pxe.getBlockNumber();
  
  // Query logs for the transaction
  const logFilter = {
    fromBlock: blockNumber - 1,
    toBlock: blockNumber,
    contractAddress: addresses.wormhole // Filter logs for our contract
  };
  
  const publicLogs = (await pxe.getPublicLogs(logFilter)).logs;
  console.log("Transaction logs:", publicLogs);
}

main().catch((err) => {
  console.error(`Error in message sending script: ${err}`);
  process.exit(1);
});