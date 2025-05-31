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
    pub struct Proofs {
        // Verification Keys
        pub vkey_a: [Field; 128],
        pub vkey_b: [Field; 128],
        pub vkey_c: [Field; 128],
        pub vkey_d: [Field; 128],
        // Proofs
        pub proof_a: [Field; 456],
        pub proof_b: [Field; 456],
        pub proof_c: [Field; 456],
        pub proof_d: [Field; 456],
        // Public Inputs
        pub pub_input_a: [Field; 2],
        pub pub_input_b: [Field; 5],
        pub pub_input_c: [Field; 5],
        pub pub_input_d: [Field; 2],
    }

    #[private]
    pub fn verify_and_publish(
        proofs: Proofs,
        arb_address: [u8;20], // arbitrum address is 160 bits (20 bytes) so it should be 0x000...ADDRESS
        vault_address: [u8;20], // vault address on arbitrurm (same as `arb_address`)
        msg: [[u8;31];5],
        wormhole_address: AztecAddress,
        token_address: AztecAddress, // address of the token to be donated
        from: AztecAddress,
        amount: u128, // amount of tokens to be donated on arbitrum
        nonce: Field
    ) {
        // 1. verify zk passport proofs
        // proof a has 2 public inputs
        std::verify_proof_with_type(
            proofs.vkey_a,
            proofs.proof_a,
            proofs.pub_input_a,
            0 as Field,
            1
        );

        // proof b,c have 5 public inputs
        std::verify_proof_with_type(
            proofs.vkey_b,
            proofs.proof_b,
            proofs.pub_input_b,
            0 as Field,
            1
        );

        std::verify_proof_with_type(
            proofs.vkey_c,
            proofs.proof_c,
            proofs.pub_input_c,
            0 as Field,
            1
        );

        // proof d has 2 public inputs
        std::verify_proof_with_type(
            proofs.vkey_d,
            proofs.proof_d,
            proofs.pub_input_d,
            0 as Field,
            1
        );

        let bridge_address = AztecAddress {
            inner: 0x1f41267c06dae96c9c3906c5f77cbc28602cc70d6d7e9d2c3072cb0a5b13edd2 // This is a placeholder, replace with actual bridge address
        };

        // 2. Perform zk Donation
        let _ = Token::at(token_address).transfer_in_private(
            from,
            bridge_address, // should be hardcoded to the bridge address but for demo purposes the user can supply it
            amount,
            nonce
        ).call(&mut context);

        // 3. prepare message
        // MSG = [Arb_Addr, Arb_Chain_ID, Vault_Contract_Address, Credential_Tag, PADDING]

        // Payload Field 1: Arbitrum Address
        let mut payload1:[u8;31] = [0;31];
        for i in 0..20 {
            payload1[i] = arb_address[i];
        }

        // Payload Field 2: Arbitrum Chain ID
        let mut payload2: [u8;31] = [0;31];
        // binary conversion: 10,004 = 100111000100 = 00001001 || 11000100 as two u8s
        payload2[0] = 196; // 11000100
        payload2[1] = 9; // 00001001

        // Payload Field 3: Vault Address
        let mut payload3: [u8;31] = [0;31];
        for i in 0..20 {
            payload3[i] = vault_address[i];
        }

        // Payload Field 4-8: Message
        // The message is already in the format of 5 u8s, so we can directly use it
        let wormhole_payload = [payload1,payload2,payload3, msg[0], msg[1], msg[2], msg[3], msg[4]];
        
        // 4. call publish message
        let _ = Wormhole::at(wormhole_address).publish_message(
            1,
            wormhole_payload,
            2,
            2,
            from,
            nonce,
        ).enqueue(&mut context);
    }
}
