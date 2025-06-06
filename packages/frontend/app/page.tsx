"use client"
import { useEffect, useRef, useState } from "react"
import { ZKPassport, type ProofResult, EU_COUNTRIES, type QueryResult, type QueryResultErrors } from "@zkpassport/sdk"
import QRCode from "react-qr-code"
import { ZKPassportHelper } from "./ZKPassportHelper" // Adjust the import path as needed

export default function Home() {
  // Only keep essential state variables
  const [message, setMessage] = useState("")
  const [queryUrl, setQueryUrl] = useState("")
  const [formattedProofs, setFormattedProofs] = useState<any>(null) // Store formatted proofs
  const [donationAmount, setDonationAmount] = useState<number | "">("")  // No default amount - user must enter
  const [submittedAmount, setSubmittedAmount] = useState<number | null>(null) // Track the actually submitted amount
  
  // UI state variables
  const [requestInProgress, setRequestInProgress] = useState(false)
  const [txHash, setTxHash] = useState("")
  const [txStatus, setTxStatus] = useState("")
  const [receivedDonation, setReceivedDonation] = useState<number | null>(null) // Just store the received donation
  const [isPolling, setIsPolling] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [showQRCode, setShowQRCode] = useState(true)
  
  // Refs
  const zkPassportRef = useRef<ZKPassport | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const collectedProofsRef = useRef<ProofResult[]>([]) // Store collected proofs
  const lockedDonationAmountRef = useRef<number | null>(null) // Lock the donation amount

  // Initialize ZKPassport on component mount
  useEffect(() => {
    if (!zkPassportRef.current) {
      zkPassportRef.current = new ZKPassport(window.location.hostname)
    }
  }, [])

  // Clean up polling interval on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Create the ZKPassport verification request
  const createRequest = async () => {
    if (!zkPassportRef.current) {
      return
    }

    // Validate donation amount before proceeding
    if (!donationAmount || donationAmount <= 0 || donationAmount > 254) {
      setError("Please enter a valid donation amount between 1 and 254")
      return
    }
    
    // LOCK the donation amount immediately when verification starts
    const lockedAmount = Number(donationAmount)
    lockedDonationAmountRef.current = lockedAmount
    setSubmittedAmount(lockedAmount)
    
    // Reset all state
    setMessage("")
    setQueryUrl("")
    setTxHash("")
    setTxStatus("")
    setReceivedDonation(null)
    setIsPolling(false)
    setShowQRCode(true)
    setError("")
    setFormattedProofs(null)
    collectedProofsRef.current = [] // Reset collected proofs

    try {
      setIsLoading(true)
      
      // Create the verification request
      const serviceScope = "obsidion-wallet-personhood"
      const queryBuilder = await zkPassportRef.current.request({
        name: "Obsidion Wallet",
        logo: window.location.origin + "/wallet-logo.png",
        purpose: "Prove your personhood and EU citizenship to make a verified donation",
        scope: serviceScope,
        mode: "fast",
        devMode: true,
      })

      // Build the query with your requirements
      const { 
        url, 
        requestId,
        onRequestReceived, 
        onGeneratingProof, 
        onProofGenerated, 
        onResult, 
        onReject, 
        onError 
      } = queryBuilder
        .in("issuing_country", [...EU_COUNTRIES, "Zero Knowledge Republic"])
        .disclose("firstname")
        .gte("age", 18)
        .disclose("document_type")
        .done()

      setQueryUrl(url)
      console.log("Verification URL:", url)
      console.log("Request ID:", requestId)

      setRequestInProgress(true)

      onRequestReceived(() => {
        console.log("QR code scanned - Request received")
        setMessage("Request received")
      })

      onGeneratingProof(() => {
        console.log("Generating proof")
        setMessage("Generating proof...")
      })

      onProofGenerated((proofResult: ProofResult) => {
        console.log("Proof generated:", proofResult)
        setMessage(`Proof received: ${proofResult.name}`)
        
        // Collect the proof for later use
        collectedProofsRef.current.push(proofResult)
        console.log(`Collected ${collectedProofsRef.current.length} proofs so far`)
      })

      // Handle query results and format proofs
      onResult(async (resultData: any) => {
        const { 
          result, 
          uniqueIdentifier, 
          verified: verificationResult, 
          queryResultErrors 
        } = resultData;
        
        console.log("Full result data keys:", Object.keys(resultData))
        console.log("Result of the query", result)
        console.log("Query result errors", queryResultErrors)
        console.log("Verification result:", verificationResult)
        console.log("Unique identifier:", uniqueIdentifier)
        
        // Try to find proofs in different possible locations
        let proofs = resultData.proofs || resultData.proof || resultData.proofResults || null;
        console.log("Raw proofs received:", proofs)
        console.log("Proofs type:", typeof proofs)
        
        // If proofs is not directly available, use the collected proofs from onProofGenerated
        if (!proofs && collectedProofsRef.current.length > 0) {
          proofs = collectedProofsRef.current;
          console.log("Using collected proofs from onProofGenerated:", proofs.length, "proofs")
        }

        // Extract data from results (only for sending to API, not for display)
        const firstName = result?.firstname?.disclose?.result || ""
        const isEUCitizen = result?.issuing_country?.in?.result || false
        const isOver18 = result?.age?.gte?.result || false
        const documentType = result?.document_type?.disclose?.result || ""
        
        setMessage("ZK proof generation completed")
        setRequestInProgress(false)
        
        // Auto close QR code after verification
        setTimeout(() => setShowQRCode(false), 1000)
        
        // Format proofs using ZKPassportHelper
        let contractProofData = null
        if (proofs && proofs.length > 0) {
          console.log("Formatting proofs for contract...")
          console.log("Number of proofs to format:", proofs.length)
          console.log("Proof names:", proofs.map((p: ProofResult) => p.name))
          
          try {
            contractProofData = await ZKPassportHelper.formatProofsForContract(proofs)
            if (contractProofData) {
              console.log("Successfully formatted proofs:", contractProofData)
              setFormattedProofs(contractProofData)
            } else {
              console.error("Failed to format proofs - received null/undefined")
            }
          } catch (formatError) {
            console.error("Error formatting proofs:", formatError)
          }
        } else {
          console.log("No proofs received to format")
          console.log("Collected proofs count:", collectedProofsRef.current.length)
        }
        
        // Prepare verification data for sending to the API
        // Convert BigInt values to strings for JSON serialization
        const serializableProofData = contractProofData ? {
          vkeys: {
            vkey_a: contractProofData.vkeys.vkey_a.map(v => v.toString()),
            vkey_b: contractProofData.vkeys.vkey_b.map(v => v.toString()),
            vkey_c: contractProofData.vkeys.vkey_c.map(v => v.toString()),
            vkey_d: contractProofData.vkeys.vkey_d.map(v => v.toString()),
            vkey_e: contractProofData.vkeys.vkey_e.map(v => v.toString()),
            vkey_f: contractProofData.vkeys.vkey_f.map(v => v.toString()),
          },
          proofs: {
            proof_a: contractProofData.proofs.proof_a.map(p => p.toString()),
            proof_b: contractProofData.proofs.proof_b.map(p => p.toString()),
            proof_c: contractProofData.proofs.proof_c.map(p => p.toString()),
            proof_d: contractProofData.proofs.proof_d.map(p => p.toString()),
            proof_e: contractProofData.proofs.proof_e.map(p => p.toString()),
            proof_f: contractProofData.proofs.proof_f.map(p => p.toString()),
          },
          vkey_hashes: {
            vkey_hash_a: contractProofData.vkey_hashes.vkey_hash_a.toString(),
            vkey_hash_b: contractProofData.vkey_hashes.vkey_hash_b.toString(),
            vkey_hash_c: contractProofData.vkey_hashes.vkey_hash_c.toString(),
            vkey_hash_d: contractProofData.vkey_hashes.vkey_hash_d.toString(),
            vkey_hash_e: contractProofData.vkey_hashes.vkey_hash_e.toString(),
            vkey_hash_f: contractProofData.vkey_hashes.vkey_hash_f.toString(),
          },
          public_inputs: {
            input_a: contractProofData.public_inputs.input_a.map(i => i.toString()),
            input_b: contractProofData.public_inputs.input_b.map(i => i.toString()),
            input_c: contractProofData.public_inputs.input_c.map(i => i.toString()),
            input_d: contractProofData.public_inputs.input_d.map(i => i.toString()),
            input_e: contractProofData.public_inputs.input_e.map(i => i.toString()),
            input_f: contractProofData.public_inputs.input_f.map(i => i.toString()),
          },
        } : null;

        // Use the LOCKED donation amount that was captured at the start
        // This ensures the amount cannot be changed by user after verification starts
        const finalDonationAmount = lockedDonationAmountRef.current!
        
        const verificationData = {
          firstName: firstName,
          isOver18: isOver18,
          isEUCitizen: isEUCitizen,
          documentType: documentType,
          uniqueIdentifier: uniqueIdentifier || "",
          amount: finalDonationAmount, // Use the locked amount
          formattedProofs: serializableProofData // Include serializable formatted proofs
        }
        
        console.log("Sending verification data to API:", verificationData)
        
        // Send data to API
        setTxStatus(`Processing your verified donation of ${finalDonationAmount} tokens...`)
        setTxHash("")
        
        try {
          const response = await fetch("/api/send-message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(verificationData)
          })
          
          if (!response.ok) {
            throw new Error(`Error: ${response.status}`)
          }
          
          const data = await response.json()
          
          if (data.success) {
            setTxStatus(`Your verified donation of ${finalDonationAmount} tokens has been submitted!`)
            setTxHash(data.txHash)
            // Start polling automatically once we have a txHash
            startPollingDonation(data.txHash)
          } else {
            setTxStatus(`Error: ${data.error}`)
            // Don't reset submittedAmount on API error - keep it for debugging
          }
        } catch (error) {
          console.error("Error sending verification data to API:", error)
          setTxStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
          // Don't reset submittedAmount on API error - keep it for debugging
        }
      })

      onReject(() => {
        console.log("User rejected")
        setMessage("User rejected the request")
        setRequestInProgress(false)
        setIsLoading(false)
        setSubmittedAmount(null) // Reset submitted amount on rejection
        lockedDonationAmountRef.current = null // Reset locked amount
      })

      onError((error: unknown) => {
        console.error("ZKPassport error:", error)
        setMessage("An error occurred")
        setRequestInProgress(false)
        setIsLoading(false)
        setSubmittedAmount(null) // Reset submitted amount on error
        lockedDonationAmountRef.current = null // Reset locked amount
        setError("Failed to complete ZKPassport verification")
      })

      setIsLoading(false)
    } catch (err) {
      console.error("Error initializing ZKPassport:", err)
      setError("Failed to initialize ZKPassport verification")
      setIsLoading(false)
      setRequestInProgress(false)
      setSubmittedAmount(null) // Reset submitted amount on error
      lockedDonationAmountRef.current = null // Reset locked amount
    }
  }

  // Function to start polling for the donation confirmation using txHash
  const startPollingDonation = (currentTxHash?: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    // Use the passed txHash or fall back to state
    const hashToUse = currentTxHash || txHash

    setIsPolling(true)
    setTxStatus((prevStatus) => `${prevStatus} - Checking donation confirmation...`)

    console.log(`Polling for donation confirmation with hash: ${hashToUse}`)

    pollingIntervalRef.current = setInterval(
      async () => {
        try {
          const response = await fetch("/api/get-arbitrum-message", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ txHash: hashToUse }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || `HTTP error ${response.status}`)
          }

          const data = await response.json()
          console.log("Polling response:", data)

          // Check if we got a non-zero amount
          if (data.success && data.parsedData && data.parsedData.amount) {
            const receivedAmount = parseInt(data.parsedData.amount)
            setReceivedDonation(receivedAmount)
            setTxStatus("Donation confirmed!")
            setIsPolling(false)

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
          }
        } catch (error) {
          console.error("Error polling donation confirmation:", error)
          setTxStatus(`Error checking donation: ${error instanceof Error ? error.message : "Unknown error"}`)

          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current)
            pollingIntervalRef.current = null
          }
          setIsPolling(false)
        }
      },
      Number.parseInt(process.env.NEXT_PUBLIC_POLLING_INTERVAL || "5000"),
    )
  }

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    setIsPolling(false)
    setTxStatus((prevStatus) => `${prevStatus} - Polling stopped.`)
  }

  // Reset function to clear all state for a new donation
  const resetForNewDonation = () => {
    setMessage("")
    setQueryUrl("")
    setFormattedProofs(null)
    setDonationAmount("")
    setSubmittedAmount(null)
    setTxHash("")
    setTxStatus("")
    setReceivedDonation(null)
    setIsPolling(false)
    setIsLoading(false)
    setError("")
    setShowQRCode(true)
    setRequestInProgress(false)
    collectedProofsRef.current = []
    lockedDonationAmountRef.current = null // Reset locked amount
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">💝 Verified Donation Platform</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Make verified donations using zero-knowledge identity proofs and secure cross-chain transfers
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - QR Code and Controls */}
          <div className="space-y-6">
            {/* Donation Amount Input */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">💰 Donation Amount</h2>
              <div className="space-y-3">
                <label htmlFor="donationAmount" className="block text-sm font-medium text-gray-700">
                  How much would you like to donate?
                </label>
                <input
                  id="donationAmount"
                  type="number"
                  min="1"
                  max="254"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value ? parseInt(e.target.value) : "")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter donation amount (1-254)"
                  required
                  disabled={requestInProgress || isLoading} // Disable during processing
                />
                <p className="text-xs text-gray-500">
                  Your donation will be securely processed after identity verification (1-254 tokens)
                </p>
                {submittedAmount === null && !donationAmount && (
                  <p className="text-xs text-red-500">
                    Donation amount is required (1-254 tokens)
                  </p>
                )}
                {submittedAmount !== null && !receivedDonation && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-xs text-blue-800 font-medium">
                      🔒 Processing donation: {submittedAmount} tokens
                    </p>
                    <p className="text-xs text-blue-600">
                      Amount is locked during verification and transaction
                    </p>
                  </div>
                )}
                {submittedAmount !== null && receivedDonation !== null && (
                  <div className="p-2 bg-green-50 border border-green-200 rounded">
                    <p className="text-xs text-green-800 font-medium">
                      ✅ Donation completed: {submittedAmount} tokens
                    </p>
                    <p className="text-xs text-green-600">
                      Cross-chain transfer confirmed successfully
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* QR Code Section */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">🔄 Identity Verification</h2>

              {showQRCode && queryUrl ? (
                <div className="text-center">
                  <div className="bg-gray-50 p-4 rounded-lg inline-block border-2 border-dashed border-gray-300">
                    <QRCode value={queryUrl} size={180} />
                  </div>
                  <p className="text-sm text-gray-500 mt-3">Scan this QR code with your ZKPassport app</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="w-40 h-40 mx-auto bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                    <div className="text-center">
                      <div className="text-3xl mb-2">📱</div>
                      <p className="text-gray-500 text-sm">Start verification</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {message && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-blue-600 mr-2">
                      {requestInProgress ? "⏳" : "✅"}
                    </span>
                    <span className="text-blue-800 font-medium">{message}</span>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-red-600 mr-2">⚠️</span>
                    <span className="text-red-800 font-medium">{error}</span>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="mt-4 space-y-2">
                <button
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={createRequest}
                  disabled={requestInProgress || isLoading || !donationAmount}
                >
                  {requestInProgress || isLoading ? "🔄 Processing..." : "💝 Verify Identity & Donate"}
                </button>
                
                {/* Reset button for new donation */}
                {(receivedDonation !== null || error) && (
                  <button
                    className="w-full bg-gray-500 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200"
                    onClick={resetForNewDonation}
                  >
                    🔄 New Donation
                  </button>
                )}
              </div>
            </div>

            {/* ZK Proofs Status */}
            {formattedProofs && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">🔐 Identity Verified</h2>
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start">
                    <span className="text-lg mr-2">✅</span>
                    <div className="flex-1">
                      <p className="font-medium text-green-800 mb-1">Zero-Knowledge Proof Generated</p>
                      <p className="text-xs text-green-600">Your identity has been verified without revealing personal data</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Donation Status and Results */}
          <div className="space-y-6">
            {/* Donation Status */}
            {(txStatus || txHash) && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">💝 Donation Status</h3>

                {txStatus && (
                  <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <div className="flex items-center">
                      {isPolling && <span className="mr-2">🔄</span>}
                      <span className="text-purple-800 font-medium text-sm">{txStatus}</span>
                    </div>
                  </div>
                )}

                {txHash && (
                  <div className="p-3 bg-gray-50 rounded-lg mb-3">
                    <p className="font-medium text-gray-700 mb-1">Donation Receipt</p>
                    <p className="text-xs text-gray-600 font-mono break-all">{txHash}</p>
                  </div>
                )}

                {/* Polling Control Button */}
                {txHash && (
                  <button
                    className={`w-full font-semibold py-2 px-4 rounded-lg transition-all duration-200 ${
                      isPolling
                        ? "bg-red-500 hover:bg-red-600 text-white"
                        : "bg-green-500 hover:bg-green-600 text-white"
                    }`}
                    onClick={isPolling ? stopPolling : () => startPollingDonation(txHash)}
                  >
                    {isPolling ? "⏹️ Stop Checking" : "🔍 Check Confirmation"}
                  </button>
                )}
              </div>
            )}

            {/* Cross-Chain Donation Confirmation */}
            {receivedDonation !== null && submittedAmount !== null && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border border-green-200">
                <h3 className="text-lg font-semibold text-green-900 mb-3">🎉 Donation Confirmed!</h3>

                <div className="bg-white p-4 rounded-lg shadow-sm border border-green-100">
                  {/* Donation Amount Verification */}
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm font-medium text-blue-800 mb-2">Donation Verification:</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-2 rounded border border-blue-100">
                        <span className="text-xs text-blue-600 font-medium block">You Donated:</span>
                        <span className="text-lg font-bold text-blue-900">{submittedAmount}</span>
                      </div>
                      <div className="bg-white p-2 rounded border border-blue-100">
                        <span className="text-xs text-blue-600 font-medium block">Confirmed:</span>
                        <span className="text-lg font-bold text-blue-900">{receivedDonation}</span>
                      </div>
                    </div>
                    {submittedAmount === receivedDonation ? (
                      <p className="text-xs text-green-600 mt-2 text-center">✅ Donation amount verified!</p>
                    ) : (
                      <p className="text-xs text-red-600 mt-2 text-center">⚠️ Amounts don't match (Expected: {submittedAmount}, Got: {receivedDonation})</p>
                    )}
                  </div>
                  
                  {/* Success Message */}
                  <div className="mt-3 pt-3 border-t border-green-100">
                    <p className="text-sm text-green-600 text-center">
                      🌟 Thank you for your verified donation! Your contribution has been securely processed across blockchains.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}