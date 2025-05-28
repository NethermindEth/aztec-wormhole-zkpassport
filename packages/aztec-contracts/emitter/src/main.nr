use dep::aztec::macros::aztec;

#[aztec]
pub contract ZKPassportCredentialEmitter {
    use dep::aztec::{
        macros::{
            functions::{public,private},
        }, 
        prelude::{AztecAddress}, 
        protocol_types::traits::{ToField,Deserialize, Serialize}
    };
    use dep::std;
    use dep::wormhole::Wormhole;
    use dep::token::Token;
    use dep::aztec::oracle::debug_log::{ debug_log,debug_log_format };

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

    #[public]
    fn verify_ZKP_2_public_inputs(
        verification_key: [Field;128], 
        proof: [Field;456], 
        public_inputs: [Field;2], 
        key_hash: Field
    ){
        std::verify_proof_with_type(
            verification_key,
            proof,
            public_inputs,
            key_hash,
            1
        );
    }

    #[public]
    fn verify_ZKP_5_public_inputs(
        verification_key: [Field;128], 
        proof: [Field;456], 
        public_inputs: [Field;5], 
        key_hash: Field
    ){
        std::verify_proof_with_type(
            verification_key,
            proof,
            public_inputs,
            key_hash,
            1
        );
    }

    #[public]
    fn verify_ZKP_10_public_inputs(
        verification_key: [Field;128], 
        proof: [Field;456], 
        public_inputs: [Field;10], 
        key_hash: Field
    ){
        std::verify_proof_with_type(
            verification_key,
            proof,
            public_inputs,
            key_hash,
            1
        );
    }

    #[private]
    pub fn verify_and_publish(
        // proofs: Proofs,
        arb_address: [u8;20], // arbitrum address is 160 bits (20 bytes) so it should be 0x000...ADDRESS
        vault_address: [u8;20], // vault address on arbitrurm (same as `arb_address`)
        cred_tag: u8, // credential tag used to identify credential proof
        wormhole_address: AztecAddress,
        token_address: AztecAddress, // address of the token to be donated
        from: AztecAddress,
        to: AztecAddress, // donation address
        amount: u128, // amount of tokens to be donated
    ) {
        // 1. verify zk passport proofs
        // proof a has 2 public inputs
        // verify_ZKP_2_public_inputs(
        //     proofs.vkey_a,
        //     proofs.proof_a,
        //     proofs.pub_input_a,
        //     0 
        // );

        // // proof b,c have 5 public inputs
        // verify_ZKP_5_public_inputs(
        //     proofs.vkey_b,
        //     proofs.proof_b,
        //     proofs.pub_input_b,
        //     0
        // );

        // verify_ZKP_5_public_inputs(
        //     proofs.vkey_c,
        //     proofs.proof_c,
        //     proofs.pub_input_c,
        //     0
        // );

        //     // proof d has 2 public inputs
        // verify_ZKP_2_public_inputs(
        //     proofs.vkey_d,
        //     proofs.proof_d,
        //     proofs.pub_input_d,
        //     0
        // );

        // 2. Perform zk Donation
        let _ = Token::at(token_address).transfer_in_private(
            from,
            to,
            amount,
            0 as Field
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

        // Payload Field 4: Credential Tag
        let mut payload4: [u8;31] = [0;31];
        payload4[0] = cred_tag;

        // Payload Fields 5-8: PADDING
        let mut payload5: [u8;31] = [0;31];
        let mut payload6: [u8;31] = [0;31];
        let mut payload7: [u8;31] = [0;31];
        let mut payload8: [u8;31] = [0;31];

        let wormhole_payload = [payload1,payload2,payload3,payload4,payload5,payload6,payload7,payload8];
        
        // 4. call publish message
        let _ = Wormhole::at(wormhole_address).publish_message(
            1,
            wormhole_payload,
            2,
            2,
            from,
        ).enqueue(&mut context);
    }
}
