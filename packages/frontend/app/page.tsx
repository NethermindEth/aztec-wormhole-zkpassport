"use client"
import { useEffect, useRef, useState } from "react"
import { ZKPassport, type ProofResult, EU_COUNTRIES, type QueryResult, type QueryResultErrors } from "@zkpassport/sdk"
import QRCode from "react-qr-code"
import { ZKPassportHelper } from "./ZKPassportHelper" // Adjust the import path as needed

export default function Home() {
  // User data state variables
  const [message, setMessage] = useState("")
  const [firstName, setFirstName] = useState("")
  const [isEUCitizen, setIsEUCitizen] = useState<boolean | undefined>(undefined)
  const [isOver18, setIsOver18] = useState<boolean | undefined>(undefined)
  const [documentType, setDocumentType] = useState("")
  const [queryUrl, setQueryUrl] = useState("")
  const [uniqueIdentifier, setUniqueIdentifier] = useState("")
  const [verified, setVerified] = useState<boolean | undefined>(undefined)
  const [formattedProofs, setFormattedProofs] = useState<any>(null) // Store formatted proofs
  
  // UI state variables
  const [requestInProgress, setRequestInProgress] = useState(false)
  const [txHash, setTxHash] = useState("")
  const [txStatus, setTxStatus] = useState("")
  const [arbitrumMessage, setArbitrumMessage] = useState<string | null>(null)
  const [rawDataChunks, setRawDataChunks] = useState<string[]>([])
  const [isPolling, setIsPolling] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [showQRCode, setShowQRCode] = useState(true)
  
  // Refs
  const zkPassportRef = useRef<ZKPassport | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const collectedProofsRef = useRef<ProofResult[]>([]) // Store collected proofs

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
    
    // Reset all state
    setFirstName("")
    setIsEUCitizen(undefined)
    setMessage("")
    setDocumentType("")
    setQueryUrl("")
    setIsOver18(undefined)
    setUniqueIdentifier("")
    setVerified(undefined)
    setTxHash("")
    setTxStatus("")
    setArbitrumMessage(null)
    setRawDataChunks([])
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
        purpose: "Prove your personhood and EU citizenship",
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

        // Extract data from results
        const firstName = result?.firstname?.disclose?.result || ""
        const isEUCitizen = result?.issuing_country?.in?.result || false
        const isOver18 = result?.age?.gte?.result || false
        const documentType = result?.document_type?.disclose?.result || ""
        
        // Store the results in state
        setFirstName(firstName)
        setIsEUCitizen(isEUCitizen)
        setIsOver18(isOver18)
        setDocumentType(documentType)
        setMessage("User verification completed")
        setUniqueIdentifier(uniqueIdentifier || "")
        setVerified(verificationResult)
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

        const verificationData = {
          firstName: firstName,
          isOver18: isOver18,
          isEUCitizen: isEUCitizen,
          documentType: documentType,
          uniqueIdentifier: uniqueIdentifier || "",
          formattedProofs: serializableProofData // Include serializable formatted proofs
        }
        
        console.log("Sending verification data to API:", verificationData)
        
        // Send data to API
        setTxStatus("Sending verification data to Aztec contract...")
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
          console.log("API response:", data)
          
          if (data.success) {
            setTxStatus("Verification data sent successfully to Aztec contract!")
            setTxHash(data.txHash)
            // Start polling automatically once we have a txHash
            startPollingArbitrumMessage(data.txHash)
          } else {
            setTxStatus(`Error: ${data.error}`)
          }
        } catch (error) {
          console.error("Error sending verification data to API:", error)
          setTxStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
      })

      onReject(() => {
        console.log("User rejected")
        setMessage("User rejected the request")
        setRequestInProgress(false)
        setIsLoading(false)
      })

      onError((error: unknown) => {
        console.error("ZKPassport error:", error)
        setMessage("An error occurred")
        setRequestInProgress(false)
        setIsLoading(false)
        setError("Failed to complete ZKPassport verification")
      })

      setIsLoading(false)
    } catch (err) {
      console.error("Error initializing ZKPassport:", err)
      setError("Failed to initialize ZKPassport verification")
      setIsLoading(false)
      setRequestInProgress(false)
    }
  }

  // Function to start polling for Arbitrum message using txHash
  const startPollingArbitrumMessage = (currentTxHash?: string) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    // Use the passed txHash or fall back to state
    const hashToUse = currentTxHash || txHash

    setIsPolling(true)
    setTxStatus((prevStatus) => `${prevStatus} - Polling for transaction data...`)

    console.log(`Polling for transaction data with hash: ${hashToUse}`)

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
          if (data.success && data.message && data.message !== "0x" && 
              data.message !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            setArbitrumMessage(data.message)
            
            // Store raw data chunks if available
            if (data.parsedData && data.parsedData.rawData) {
              setRawDataChunks(data.parsedData.rawData)
            }
            
            setTxStatus("Transaction data received!")
            setIsPolling(false)

            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
          }
        } catch (error) {
          console.error("Error polling transaction data:", error)
          setTxStatus(`Error polling: ${error instanceof Error ? error.message : "Unknown error"}`)

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-800 mb-4">🛡️ ZKPassport Verification</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Secure identity verification using zero-knowledge proofs and cross-chain messaging
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - QR Code and Controls */}
          <div className="space-y-6">
            {/* QR Code Section */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">🔄 Verification Request</h2>

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
                      <p className="text-gray-500 text-sm">Generate request</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Message */}
              {message && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-blue-600 mr-2">
                      {requestInProgress ? "⏳" : verified === true ? "✅" : verified === false ? "❌" : "⏱️"}
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
              <div className="mt-4">
                <button
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={createRequest}
                  disabled={requestInProgress || isLoading}
                >
                  {requestInProgress || isLoading ? "🔄 Processing..." : "🛡️ Generate New Request"}
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Results */}
          <div className="space-y-6">
            {/* Verification Results */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">✅ Verification Results</h2>

              <div className="space-y-3">
                {/* First Name */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-lg mr-2">👤</span>
                    <span className="font-medium text-gray-700">First Name</span>
                  </div>
                  <span className="text-gray-900 font-semibold">{firstName || "Not verified"}</span>
                </div>

                {/* Document Type */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-lg mr-2">📄</span>
                    <span className="font-medium text-gray-700">Document Type</span>
                  </div>
                  <span className="text-gray-900 font-semibold">{documentType || "Not verified"}</span>
                </div>

                {/* EU Citizenship */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-lg mr-2">🌍</span>
                    <span className="font-medium text-gray-700">EU Citizen</span>
                  </div>
                  <div className="flex items-center">
                    {typeof isEUCitizen === "boolean" ? (
                      <>
                        <span className="mr-1">{isEUCitizen ? "✅" : "❌"}</span>
                        <span className={`font-semibold ${isEUCitizen ? "text-green-600" : "text-red-600"}`}>
                          {isEUCitizen ? "Yes" : "No"}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500">Not verified</span>
                    )}
                  </div>
                </div>

                {/* Age Verification */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-lg mr-2">📅</span>
                    <span className="font-medium text-gray-700">Over 18</span>
                  </div>
                  <div className="flex items-center">
                    {typeof isOver18 === "boolean" ? (
                      <>
                        <span className="mr-1">{isOver18 ? "✅" : "❌"}</span>
                        <span className={`font-semibold ${isOver18 ? "text-green-600" : "text-red-600"}`}>
                          {isOver18 ? "Yes" : "No"}
                        </span>
                      </>
                    ) : (
                      <span className="text-gray-500">Not verified</span>
                    )}
                  </div>
                </div>

                {/* Overall Verification Status */}
                {verified !== undefined && (
                  <div
                    className={`p-3 rounded-lg border-2 ${verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
                  >
                    <div className="flex items-center">
                      <span className="text-xl mr-2">{verified ? "✅" : "❌"}</span>
                      <div>
                        <p className={`font-semibold ${verified ? "text-green-800" : "text-red-800"}`}>
                          {verified ? "Verification Successful" : "Verification Failed"}
                        </p>
                        <p className={`text-sm ${verified ? "text-green-600" : "text-red-600"}`}>
                          {verified ? "User identity verified" : "Unable to verify user identity"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Unique Identifier */}
              {uniqueIdentifier && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start">
                    <span className="text-lg mr-2">#️⃣</span>
                    <div className="flex-1">
                      <p className="font-medium text-blue-800 mb-1">Unique Identifier</p>
                      <p className="text-xs text-blue-600 font-mono break-all">{uniqueIdentifier}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Formatted Proofs Status */}
              {formattedProofs && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start">
                    <span className="text-lg mr-2">🔐</span>
                    <div className="flex-1">
                      <p className="font-medium text-green-800 mb-1">ZK Proofs Formatted</p>
                      <p className="text-xs text-green-600">Proofs successfully formatted for contract verification</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Transaction Status */}
            {(txStatus || txHash) && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">🔗 Transaction Status</h3>

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
                    <p className="font-medium text-gray-700 mb-1">Transaction Hash</p>
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
                    onClick={isPolling ? stopPolling : () => startPollingArbitrumMessage(txHash)}
                  >
                    {isPolling ? "⏹️ Stop Polling" : "▶️ Start Polling"}
                  </button>
                )}
              </div>
            )}

          {/* Cross-Chain Message - CLEANED VERSION */}
          {arbitrumMessage && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl shadow-lg p-6 border border-green-200">
              <h3 className="text-lg font-semibold text-green-900 mb-3">🌉 Cross-Chain Verification Complete</h3>

              <div className="bg-white p-4 rounded-lg shadow-sm border border-green-100">
                {/* Transaction Amount - Only uint8 */}
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 mb-1">Transaction Amount:</p>
                  {rawDataChunks.length > 0 && (
                    <div className="bg-white p-2 rounded-lg border border-blue-100">
                      <span className="text-xs text-blue-600 font-medium block mb-1">as uint8 (1 byte):</span>
                      <span className="text-lg font-bold text-blue-900">
                        {parseInt(rawDataChunks[0].substring(0, 2), 16)}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Success Message */}
                <div className="mt-3 pt-3 border-t border-green-100">
                  <p className="text-sm text-green-600">
                    ✅ Transaction data successfully received across blockchains using Wormhole protocol
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