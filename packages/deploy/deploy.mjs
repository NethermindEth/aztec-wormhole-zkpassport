// src/deploy.mjs
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, Contract, createPXEClient, loadContractArtifact, waitForPXE, computeAuthWitMessageHash } from '@aztec/aztec.js';
import EmitterJSON from "../aztec-contracts/emitter/target/emitter-ZKPassportCredentialEmitter.json" assert { type: "json" };

import { writeFileSync } from 'fs';
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

async function mintTokensToPrivate(
  token, // TokenContract
  minterWallet, 
  recipient,
  amount
) {
  const tokenAsMinter = await TokenContract.at(token.address, minterWallet);
  await tokenAsMinter.methods
    .mint_to_private(minterWallet.getAddress(), recipient, amount)
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
  const wormhole_address = AztecAddress.fromString("0x11d1743b4ff7427e762875f07eec863ebf42e700c13344a826e6e967e7776d8d");
  const token_address = "0x2e2647184acbb40be33ff9faac1a0dd6cfa97dc70a34199c5001e08835857ac5";

  const emitter = await Contract.deploy(ownerWallet, EmitterContractArtifact, [AztecAddress.fromString(token_address)])
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

  console.log(`Minting tokens to private for owner...`);
  await mintTokensToPrivate(
    token,
    ownerWallet,
    ownerAddress,
    100n
  );
  
  const tokenTransferAction = token.methods.transfer_in_public(
    ownerAddress, 
    receiverWallet.getAddress(),
    2n,
    31n
  ); 

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

  const donationAction = token.methods.transfer_in_private(
    ownerWallet.getAddress(),
    receiverWallet.getAddress(),
    1n,
    0n
  );
  console.log("Generating authwit for donation...");

  const donationWitness = await ownerWallet.createAuthWit({ caller: emitter.address, action: donationAction });

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

  console.log(`arb: ${arb_address} \nvault: ${vault_address}`);

  console.log("Calling emitter verify and publish...") 
  
  const _tx = await contract.methods.verify_and_publish(
    arb_address, vault_address, 0x3, wormhole_address, token.address,
    ownerWallet.getAddress(), receiverWallet.getAddress(), 1 // must be consistent with authwit above
  ).send( { authWitnesses: [donationWitness] }).wait(); 

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