// @ts-ignore
import {
  // @ts-ignore
  type ProofResult,
  // @ts-ignore
  getHostedPackagedCircuitByName,
  // @ts-ignore
  getProofData,
  // @ts-ignore
  getCommitmentFromDSCProof,
  // @ts-ignore
  getMerkleRootFromDSCProof,
  // @ts-ignore
  getCommitmentInFromIDDataProof,
  // @ts-ignore
  getCommitmentOutFromIDDataProof,
  // @ts-ignore
  getNullifierFromDisclosureProof,
  // @ts-ignore
  getCommitmentInFromIntegrityProof,
  // @ts-ignore
  getCommitmentOutFromIntegrityProof,
  // @ts-ignore
  getCommitmentInFromDisclosureProof,
  // @ts-ignore
  ultraVkToFields,
  // @ts-ignore
  getNumberOfPublicInputs,
} from "@zkpassport/utils"

export interface ContractProofData {
  vkeys: {
    vkey_a: bigint[]
    vkey_b: bigint[]
    vkey_c: bigint[]
    vkey_d: bigint[]
  }
  proofs: {
    proof_a: bigint[]
    proof_b: bigint[]
    proof_c: bigint[]
    proof_d: bigint[]
  }
  public_inputs: {
    input_a: bigint[]
    input_b: bigint[]
    input_c: bigint[]
    input_d: bigint[]
  }
}


type SubCircuitProof = {
  vkey: bigint[]
  proof: bigint[]
  public_inputs: bigint[]
  commitments: bigint[]
}

/**
 * ZKPassportHelper class provides methods for working with zkPassport proofs
 * and preparing them for use with Aztec contracts.
 */
export class ZKPassportHelper {
  // Add a constant for the proof size
  private static readonly PROOF_SIZE = 456 // Match the contract's PROOF_SIZE constant
  private static readonly VKEY_SIZE = 128

  /**
   * Get verification key for a circuit using name and hash
   * @param proofResult - The proof result containing circuit information
   * @returns Promise resolving to an array of bigints representing the verification key or undefined
   */
  public static async getCircuitVerificationKey(
    proofResult: ProofResult,
  ): Promise<bigint[] | undefined> {
    try {
      if (!proofResult.name || !proofResult.vkeyHash || !proofResult.version) {
        throw new Error("Missing required proof information (name, vkeyHash, or version)")
      }
      console.log("proofResult:", proofResult)

      // Fetch the packaged circuit data using vkeyHash
      console.log("Fetching packaged circuit with vkeyHash:", proofResult.vkeyHash)
      try {
        console.log("version:", proofResult.version)
        console.log("name:", proofResult.name)
        const fallbackCircuit = await getHostedPackagedCircuitByName(
          proofResult.version,
          proofResult.name,
        )
        console.log("Fallback circuit:", fallbackCircuit)
        console.log("Packaged circuit:", fallbackCircuit ? "Found" : "Not found")

        if (fallbackCircuit && fallbackCircuit.vkey) {
          const vkeyUint8Array = this.base64ToUint8Array(fallbackCircuit.vkey)
          const vkeyFieldsString = ultraVkToFields(vkeyUint8Array)

          const vkeyFields: bigint[] = vkeyFieldsString.map((f: string) =>
            BigInt(f.startsWith("0x") ? f : "0x" + f),
          )

          return vkeyFields
        }
      } catch (fallbackError) {
        console.error("Error fetching circuit by name:", fallbackError)
      }
      return undefined
    } catch (error) {
      console.error("Error in getCircuitVerificationKey:", error)
      if (error instanceof Error) {
        console.error("Error message:", error.message)
        console.error("Error stack:", error.stack)
      }
      return undefined
    }
  }

  /**
   * Unified function to format circuit proof data structures
   * @param proofResult - The proof result to format
   * @param circuitType - The type of circuit (A, B, C, or D)
   * @returns Promise resolving to an object containing vkey, proof, and public_inputs
   */
  public static async formatSubCircuit(
    proofResult: ProofResult,
    circuitType: "A" | "B" | "C" | "D",
  ): Promise<SubCircuitProof> {
    try {
      console.log(`Formatting SubCircuit${circuitType} for proof:`, proofResult.name)

      // Get the proof data
      let proofData: any
      try {
        console.log("Getting proof data from:", typeof proofResult.proof)
        proofData = getProofData(
          proofResult.proof as string,
          getNumberOfPublicInputs(proofResult.name!),
        )
      } catch (proofError) {
        console.error("Error getting proof data:", proofError)
      }
      const formattedProofData = proofData.proof.map((hexStr: string) => {
        // Convert hex string to BigInt
        return BigInt(hexStr.startsWith("0x") ? hexStr : `0x${hexStr}`)
      })

      // Get verification key using name and hash
      let vkey: bigint[] = []
      try {
        // Get the verification key directly as BigInt array
        const fetchedVkey = await this.getCircuitVerificationKey(proofResult)
        if (!fetchedVkey) {
          throw new Error(`Failed to get verification key for circuit ${circuitType}`)
        }
        vkey = fetchedVkey
        console.log("Got vkey array:", vkey.length, "elements")
      } catch (vkeyError) {
        console.error(`Error getting verification key for circuit ${circuitType}:`, vkeyError)
        throw vkeyError
      }

      // Extract public inputs based on circuit type, this gets the commitments in and the commitments out
      let publicInputs: bigint[] = []
      let commitments: bigint[] = []
      try {
        switch (circuitType) {
          case "A": // DSC proof
            const root = getMerkleRootFromDSCProof(proofData)
            const commitment = getCommitmentFromDSCProof(proofData)
            publicInputs = proofData.publicInputs
            console.log("Public inputs: for proof", proofResult.name, publicInputs)
            commitments = [root, commitment]
            console.log(
              "Successfully retrieved commitment: A",
              "root: ",
              root.toString(),
              "commitment: ",
              commitment.toString(),
            )
            break

          case "B": // ID Data proof
            const commitmentInB = getCommitmentInFromIDDataProof(proofData)
            const commitmentOutB = getCommitmentOutFromIDDataProof(proofData)
            publicInputs = proofData.publicInputs
            console.log("Public inputs: for proof", proofResult.name, publicInputs)
            commitments = [commitmentInB, commitmentOutB]
            console.log(
              "Successfully retrieved commitments: B",
              "in: ",
              commitmentInB.toString(),
              "out: ",
              commitmentOutB.toString(),
            )
            break

          case "C": // Integrity proof
            const commitmentInC = getCommitmentInFromIntegrityProof(proofData)
            const commitmentOutC = getCommitmentOutFromIntegrityProof(proofData)
            publicInputs = proofData.publicInputs
            console.log("Public inputs: for proof", proofResult.name, publicInputs)
            commitments = [commitmentInC, commitmentOutC]
            console.log(
              "Successfully retrieved commitments: C",
              "in: ",
              commitmentInC.toString(),
              "out: ",
              commitmentOutC.toString(),
            )
            break

          case "D": // Disclosure proof
            const commitmentInD = getCommitmentInFromDisclosureProof(proofData)
            const nullifier = getNullifierFromDisclosureProof(proofData)
            console.log("Nullifier:", nullifier.toString())
            publicInputs = proofData.publicInputs
            console.log("Public inputs: for proof", proofResult.name, publicInputs)
            commitments = [commitmentInD, nullifier]
            console.log(
              "Successfully retrieved commitment and nullifier: D",
              "in: ",
              commitmentInD.toString(),
              "nullifier: ",
              nullifier.toString(),
            )
            break
        }
      } catch (extractionError) {
        console.error(
          `Error extracting public inputs for SubCircuit${circuitType}:`,
          extractionError,
        )
      }

      if (
        vkey.length !== this.VKEY_SIZE ||
        formattedProofData.length !== this.PROOF_SIZE ||
        ![2, 5, 10].includes(publicInputs.length) ||
        commitments.length !== 2
      ) {
        throw new Error(`Missing required data for SubCircuit${circuitType}`)
      }
      return {
        vkey: vkey,
        proof: formattedProofData,
        public_inputs: publicInputs,
        commitments: commitments,
      }
    } catch (error) {
      console.error(`Error in formatSubCircuit${circuitType}:`, error)
      if (error instanceof Error) {
        console.error("Error message:", error.message)
        console.error("Error stack:", error.stack)
      }
      throw new Error(`Failed to format SubCircuit${circuitType}: Invalid or missing data`)
    }
  }

  /**
   * Format all proofs for the smart contract
   * @param proofs - Array of proof results to format
   * @returns Promise resolving to contract proof data or undefined if an error occurs
   */
  public static async formatProofsForContract(
    proofs: ProofResult[],
  ): Promise<ContractProofData | undefined> {
    try {
      console.log("Starting formatProofsForContract with proofs:", proofs)

      // Define the expected proof keywords and their order
      const proofKeywords = {
        A: "dsc", // Document Signer Certificate check
        B: "id_data", // ID Data check
        C: "integrity", // Integrity check
        D: "disclose", // Disclosure check
      }

      // The expected order of proofs in the verification process
      const expectedProofOrder = [
        proofKeywords.A,
        proofKeywords.B,
        proofKeywords.C,
        proofKeywords.D,
      ]

      // Check if we have all required proofs (4 total)
      if (proofs.length !== 4) {
        console.error(`Incorrect number of proofs: expected 4, got ${proofs.length}`)
        console.error("Expected proof order:", expectedProofOrder.join(" → "))
        console.error("Missing proofs will prevent successful verification")
      }

      // Check if proofs are in the expected order by looking for keywords in names
      const detectedOrder = proofs.map((proof) => {
        const name = proof.name?.toLowerCase()
        if (name?.includes(proofKeywords.A)) return proofKeywords.A
        if (name?.includes(proofKeywords.B)) return proofKeywords.B
        if (name?.includes(proofKeywords.C)) return proofKeywords.C
        if (name?.includes(proofKeywords.D)) return proofKeywords.D
        return "unknown"
      })

      // Validate proof order
      let isCorrectOrder = true
      for (let i = 0; i < Math.min(detectedOrder.length, expectedProofOrder.length); i++) {
        if (detectedOrder[i] !== expectedProofOrder[i]) {
          isCorrectOrder = false
          console.error(
            `Incorrect proof at position ${i}: expected ${expectedProofOrder[i]}, got ${detectedOrder[i]}`,
          )
        }
      }

      if (!isCorrectOrder) {
        console.error("Proofs are not in the correct order. This may lead to verification failure.")
        console.error("The proofs must follow this order:", expectedProofOrder.join(" → "))
      } else {
        console.log("✓ Proofs are in the correct order")
      }

      // Mapping of expected circuit names to positions
      const circuitMap = {
        dsc_check: 0, // Circuit A
        id_attribute_check: 1, // Circuit B
        integrity_check_sha256: 2, // Circuit C
        disclosure_check: 3, // Circuit D
      }

      console.log("Found proofs:", {
        dscProof: proofs[0]?.name,
        idDataProof: proofs[1]?.name,
        integrityProof: proofs[2]?.name,
        disclosureProof: proofs[3]?.name,
      })

      // Find the proofs by keyword rather than position
      const proofA = proofs.find((p) => p.name?.toLowerCase().includes(proofKeywords.A))
      const proofB = proofs.find((p) => p.name?.toLowerCase().includes(proofKeywords.B))
      const proofC = proofs.find((p) => p.name?.toLowerCase().includes(proofKeywords.C))
      const proofD = proofs.find((p) => p.name?.toLowerCase().includes(proofKeywords.D))

      // Check if all required proofs were found
      if (!proofA || !proofB || !proofC || !proofD) {
        console.error("Missing required proofs:")
        if (!proofA) console.error("- Missing DSC proof (Circuit A)")
        if (!proofB) console.error("- Missing ID Data proof (Circuit B)")
        if (!proofC) console.error("- Missing Integrity proof (Circuit C)")
        if (!proofD) console.error("- Missing Disclosure proof (Circuit D)")
        return undefined
      }

      // Format the proofs
      console.log("Formatting proofs in correct order...")
      console.log("Formatting proof A (DSC):", proofA.name)
      const formattedProofA = await this.formatSubCircuit(proofA, "A")

      console.log("Formatting proof B (ID Data):", proofB.name)
      const formattedProofB = await this.formatSubCircuit(proofB, "B")

      console.log("Formatting proof C (Integrity):", proofC.name)
      const formattedProofC = await this.formatSubCircuit(proofC, "C")

      console.log("Formatting proof D (Disclosure):", proofD.name)
      const formattedProofD = await this.formatSubCircuit(proofD, "D")

      // Extract the scoped nullifier from the last element of proof D's public inputs
      const scopedNullifier =
        formattedProofD.public_inputs[formattedProofD.public_inputs.length - 1]
      if (scopedNullifier === undefined) {
        throw new Error("Failed to extract scoped nullifier from proof data")
      }
      console.log("Scoped nullifier (zkID):", scopedNullifier.toString())
      console.log("bigint scoped nullifier:", BigInt(scopedNullifier))

      const originalPublicInputs = {
        input_a: formattedProofA.public_inputs,
        input_b: formattedProofB.public_inputs,
        input_c: formattedProofC.public_inputs,
        input_d: formattedProofD.public_inputs,
      }

      // Use the original public inputs without reordering
      const originalCommitments = {
        input_a: formattedProofA.commitments,
        input_b: formattedProofB.commitments,
        input_c: formattedProofC.commitments,
        input_d: formattedProofD.commitments,
      }

      // Check all connections in the proof chain
      const chainConnections = [
        // A output -> B input
        originalCommitments.input_a[1] === originalCommitments.input_b[0],
        // B output -> C input
        originalCommitments.input_b[1] === originalCommitments.input_c[0],
        // C output -> D input
        originalCommitments.input_c[1] === originalCommitments.input_d[0],
        // D output = nullifier
        originalCommitments.input_d[1] === BigInt(scopedNullifier),
        "D→ZkID match failed",
      ]
      console.log("Chain connections:", chainConnections)

      const isChainValid = chainConnections.every((check) => check)

      if (isChainValid) {
        console.log("✓ Proof chain integrity verified successfully")
      } else {
        console.error("✗ Proof chain integrity verification failed")
        console.error("The proof chain must connect properly from A→B→C→D")
      }

      // Structure the data to match the Noir contract
      console.log("Returning formatted proof data with original public inputs")
      return {
        vkeys: {
          vkey_a: formattedProofA.vkey,
          vkey_b: formattedProofB.vkey,
          vkey_c: formattedProofC.vkey,
          vkey_d: formattedProofD.vkey,
        },
        proofs: {
          proof_a: formattedProofA.proof,
          proof_b: formattedProofB.proof,
          proof_c: formattedProofC.proof,
          proof_d: formattedProofD.proof,
        },
        public_inputs: {
          input_a: originalPublicInputs.input_a,
          input_b: originalPublicInputs.input_b,
          input_c: originalPublicInputs.input_c,
          input_d: originalPublicInputs.input_d,
        },
      }
    } catch (error) {
      console.error("Error in formatProofsForContract:", error)
      if (error instanceof Error) {
        console.error("Error message:", error.message)
        console.error("Error stack:", error.stack)
      }

      // Return a fallback structure with default values
      console.warn("Using fallback values for contract proof data")
      return undefined
    }
  }

  public static base64ToUint8Array(base64: string): Uint8Array {
    const buffer = Buffer.from(base64, "base64")
    return new Uint8Array(buffer)
  }

  /**
   * Extract zkID (nullifier) from formatted proof data
   * @param contractProofData - The formatted contract proof data
   * @returns The zkID as a bigint, or undefined if not found
   */
  public static extractZkID(contractProofData: ContractProofData): bigint | undefined {
    try {
      // The zkID is the nullifier in the disclosure proof (circuit D)
      if (contractProofData?.public_inputs?.input_d?.[1]) {
        return contractProofData.public_inputs.input_d[1]
      }
      return undefined
    } catch (error) {
      console.error("Error extracting zkID:", error)
      return undefined
    }
  }
}