use dep::aztec::macros::aztec;

#[aztec]
pub contract ZKPassportCredentialEmitter {
    use dep::aztec::{
        macros::{
            functions::private,
        }, 
        prelude::{AztecAddress}, 
        protocol_types::traits::{Deserialize, Serialize}
    };
    use dep::std;
    use dep::wormhole::Wormhole;
    use dep::token::Token;

    #[derive(Deserialize, Serialize)]
    pub struct ContractProofData {
        vkeys: vkeys,
        proofs: proofs,
        vkey_hashes: vkey_hashes,
        pub_inputs: pub_inputs,
    }

    struct vkeys {
        vkey_a: [Field; 128],
        vkey_b: [Field; 128],
        vkey_c: [Field; 128],
        vkey_d: [Field; 128],
        vkey_e: [Field; 128],
        vkey_f: [Field; 128],
    }

    struct proofs {
        proof_a: [Field; 456],
        proof_b: [Field; 456],
        proof_c: [Field; 456],
        proof_d: [Field; 456],
        proof_e: [Field; 456],
        proof_f: [Field; 456],
    }

    struct pub_inputs {
        pub_input_a: [Field; 2],
        pub_input_b: [Field; 2],
        pub_input_c: [Field; 10],
        pub_input_d: [Field; 5],
        pub_input_e: [Field; 5],
        pub_input_f: [Field; 5],
    }

    struct vkey_hashes {
        vkey_hash_a: Field,
        vkey_hash_b: Field,
        vkey_hash_c: Field,
        vkey_hash_d: Field,
        vkey_hash_e: Field,
        vkey_hash_f: Field,
    }

    #[private]
    pub fn verify_and_publish(
        proofs: ContractProofData,
        msg: [[u8;31];7], // Format: [zkDonation Arb Address, Arb chain ID, msg1, msg2, msg3, msg4, msg5]
        wormhole_address: AztecAddress,
        token_address: AztecAddress, // address of the token to be donated
        amount: u128, // amount of tokens to be donated on chosen chainID
        nonce: Field
    ) {
        // 1. verify zk passport proofs
        // proof a,b has 2 public inputs
        std::verify_proof_with_type(
            proofs.vkeys.vkey_a,
            proofs.proofs.proof_a,
            proofs.pub_inputs.pub_input_a,
            proofs.vkey_hashes.vkey_hash_a,
            1
        );

        std::verify_proof_with_type(
            proofs.vkeys.vkey_b,
            proofs.proofs.proof_b,
            proofs.pub_inputs.pub_input_b,
            proofs.vkey_hashes.vkey_hash_b,
            1
        );

        // proof c has 10 public inputs
        std::verify_proof_with_type(
            proofs.vkeys.vkey_c,
            proofs.proofs.proof_c,
            proofs.pub_inputs.pub_input_c,
            proofs.vkey_hashes.vkey_hash_c,
            1
        );

        // proof d,e,f have 5 public inputs
        std::verify_proof_with_type(
            proofs.vkeys.vkey_d,
            proofs.proofs.proof_d,
            proofs.pub_inputs.pub_input_d,
            proofs.vkey_hashes.vkey_hash_d,
            1
        );

        std::verify_proof_with_type(
            proofs.vkeys.vkey_e,
            proofs.proofs.proof_e,
            proofs.pub_inputs.pub_input_e,
            proofs.vkey_hashes.vkey_hash_e,
            1
        );

        std::verify_proof_with_type(
            proofs.vkeys.vkey_f,
            proofs.proofs.proof_f,
            proofs.pub_inputs.pub_input_f,
            proofs.vkey_hashes.vkey_hash_f,
            1
        );

        let bridge_address = AztecAddress {
            inner: 0x1f41267c06dae96c9c3906c5f77cbc28602cc70d6d7e9d2c3072cb0a5b13edd2 // This is a placeholder, replace with actual bridge address
        };

        // 2. Perform zk Donation
        let _ = Token::at(token_address).transfer_in_private(
            context.msg_sender(),
            bridge_address, // should be hardcoded to the bridge address but for demo purposes the user can supply it
            amount,
            nonce
        ).call(&mut context);

        // 3. prepare message
        // MSG = [zkDonation Arb Address, Arb chain ID, Amount, payload]

        // Payload Field 3: Amount as [u8;31]
        // let amount_field: Field = amount as Field;
        // let payload3: [u8; 31] = amount_field.to_be_bytes();

        let amount_field: Field = amount as Field;
        let payload3: [u8; 31] = amount_field.to_le_bytes();

        // Payload Field 4-8: Message
        // The message is already in the format of 5 u8s, so we can directly use it
        let wormhole_payload = [msg[0], msg[1], payload3, msg[2], msg[3], msg[4], msg[5], msg[6]];
                
        // 4. call publish message
        let _ = Wormhole::at(wormhole_address).publish_message(
            1, 
            wormhole_payload,
            2,
            2,
            context.msg_sender(),
            nonce,
        ).enqueue(&mut context);
    }
}