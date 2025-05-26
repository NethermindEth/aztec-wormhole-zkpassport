// src/deploy.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createPXEClient, Fr, loadContractArtifact, waitForPXE } from '@aztec/aztec.js';
import EmitterJSON from "../aztec-contracts/emitter/target/emitter-ZKPassportCredentialEmitter.json" assert { type: "json" };

import { writeFileSync } from 'fs';
import { getBytes, keccak256, } from 'ethers';
import { Wallet } from 'ethers';
import { TokenContract } from '@aztec/noir-contracts.js/Token'; 

const EmitterContractArtifact = loadContractArtifact(EmitterJSON);

const { PXE_URL = 'http://localhost:8080' } = process.env;


// Call `aztec-nargo compile` to compile the contract
// Call `aztec codegen ./src -o src/artifacts/` to generate the contract artifacts

// Run first ``` aztec start --sandbox ```
// then deploy a wormhole instance 
// then run this script with ``` node deploy.mjs ```

async function mintTokensToPublic(
  token, // TokenContract
  minterWallet, 
  recipient,
  amount
) {
  const tokenAsMinter = await TokenContract.at(token.address, minterWallet);
  await tokenAsMinter.methods
    .mint_to_public(recipient, amount)
    .send()
    .wait();
}

async function main() {
  const pxe = createPXEClient(PXE_URL);
  await waitForPXE(pxe);

  console.log(`Connected to PXE at ${PXE_URL}`);

  const [ownerWallet, receiverWallet] = await getInitialTestAccountsWallets(pxe);
  const ownerAddress = ownerWallet.getAddress();

  console.log(`Owner address: ${ownerAddress}`);
  console.log(`Receiver address: ${receiverWallet.getAddress()}`);

  // EXISTING WORMHOLE AND TOKEN CONTRACT ADDRESSES
  const wormhole_address = AztecAddress.fromString("0x0a7f1665c8a03ff913a3272175c157aa444dea98cdbffead03d84d4f5ea9b41c");
  const token_address = "0x22e3ec187680b67f71a89a1e63a80eb0272d3c420de66d4ffa937a76031a4a9d";

  const emitter = await Contract.deploy(ownerWallet, EmitterContractArtifact)
      .send()
      .deployed();

  console.log(`Emitter deployed at ${emitter.address.toString()}`);

  // action to be taken using authwit
  console.log("Getting token contract...");
  const token = await TokenContract.at(token_address, ownerWallet);

  console.log(`Minting tokens to public...`);
  await mintTokensToPublic(
    token,
    ownerWallet,
    emitter.address,
    1000n
  );

  console.log("Tokens minted to emitter address...");
  
  const tokenTransferAction = token.methods.transfer_in_public(
    ownerAddress, 
    receiverWallet.getAddress(),
    2n,
    31n
  ); 

  console.log("Token transfer action created...");

  // generate authwit to allow for wormhole to send funds to itself on behalf of owner
  const validateActionInteraction = await ownerWallet.setPublicAuthWit(
    {
      caller: wormhole_address,
      action: tokenTransferAction
    },
    true
  );
  console.log("Generating authwit for token transfer...");
  await validateActionInteraction.send().wait();

  const addresses = { emitter: emitter.address.toString() };
  writeFileSync('addresses.json', JSON.stringify(addresses, null, 2));

  console.log("Getting emitter contract...")

  const contract = await Contract.at(emitter.address, EmitterContractArtifact, ownerWallet);

  console.log("Defining addresses...")
  
  let arb_address = new Uint8Array(20);
  let vault_address = new Uint8Array(20);
  
  for (let i = 0; i < 20; i++) {
      arb_address[i] = 0;
      vault_address[i] = i+1;
  }

  console.log(`arb: ${arb_address}`)
  console.log("Generating signature...")

  const ownerPrivateKey = ownerWallet.getSecretKey().toString(); 
  const msgHash = keccak256(arb_address);
  const wallet = new Wallet(ownerPrivateKey);
  console.log(`msgHash: ${Fr.fromHexString(msgHash)}`);
  
  const signature = wallet.signingKey.sign(getBytes(msgHash));
  const rBytes = getBytes(signature.r);
  const sBytes = getBytes(signature.s);
  const signatureBytes = [...rBytes, ...sBytes]; // [u8; 64]

  const publicKey = wallet.signingKey.publicKey; // Uncompressed 65-byte key (0x04 + x + y)
  const pubKeyBytes = getBytes(publicKey); // Uint8Array
  const pubKeyX = pubKeyBytes.slice(1, 33); // [u8; 32]
  const pubKeyY = pubKeyBytes.slice(33, 65); // [u8; 32]

  console.log("Calling emitter verify and publish...") 
  const _tx = await contract.methods.verify_and_publish(
    pubKeyX, pubKeyY, signatureBytes, 
    arb_address, getBytes(msgHash), vault_address, 0x3, wormhole_address, 
    ownerAddress // must be consistent with authwit above
  ).send().wait(); 

  const sampleLogFilter = {
      fromBlock: 0,
      toBlock: 190,
      contractAddress: '0x18c3c6b66d5a86b9e1718b9c47f1d28272228754f9697763f1d7b35cda18bd35'
  };

  console.log(_tx);

  const logs = await pxe.getPublicLogs(sampleLogFilter);

  console.log(logs.logs[0]);

  const fromBlock = await pxe.getBlockNumber();
  const logFilter = {
      fromBlock,
      toBlock: fromBlock + 1,
  };
  const publicLogs = (await pxe.getPublicLogs(logFilter)).logs;

  console.log(publicLogs);
}

main().catch((err) => {
  console.error(`Error in deployment script: ${err}`);
  process.exit(1);
});