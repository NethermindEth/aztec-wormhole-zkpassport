"use client";
import { useEffect, useRef, useState } from "react";
import { ZKPassport, ProofResult, EU_COUNTRIES } from "@zkpassport/sdk";
import QRCode from "react-qr-code";

// Add button to call API that runs your script
export default function Home() {
  const [message, setMessage] = useState("");
  const [firstName, setFirstName] = useState("");
  const [isEUCitizen, setIsEUCitizen] = useState<boolean | undefined>(undefined);
  const [isOver18, setIsOver18] = useState<boolean | undefined>(undefined);
  const [queryUrl, setQueryUrl] = useState("");
  const [uniqueIdentifier, setUniqueIdentifier] = useState("");
  const [verified, setVerified] = useState<boolean | undefined>(undefined);
  const [requestInProgress, setRequestInProgress] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [arbitrumMessage, setArbitrumMessage] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const zkPassportRef = useRef<ZKPassport | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!zkPassportRef.current) {
      zkPassportRef.current = new ZKPassport(window.location.hostname);
    }
  }, []);

  // Clean up polling interval on component unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const createRequest = async () => {
    if (!zkPassportRef.current) {
      return;
    }
    setFirstName("");
    setIsEUCitizen(undefined);
    setMessage("");
    setQueryUrl("");
    setIsOver18(undefined);
    setUniqueIdentifier("");
    setVerified(undefined);
    setTxHash("");
    setTxStatus("");
    setArbitrumMessage(null);
    setIsPolling(false);

    const queryBuilder = await zkPassportRef.current.request({
      name: "ZKPassport",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "Proof of EU citizenship and firstname",
      scope: "eu-adult",
      mode: "fast",
      devMode: true,
    });

    const {
      url,
      onRequestReceived,
      onGeneratingProof,
      onProofGenerated,
      onResult,
      onReject,
      onError,
    } = queryBuilder
      .in("issuing_country", [...EU_COUNTRIES, "Zero Knowledge Republic"])
      .disclose("firstname")
      .gte("age", 18)
      .disclose("document_type")
      .done();

    setQueryUrl(url);
    console.log(url);

    setRequestInProgress(true);

    onRequestReceived(() => {
      console.log("QR code scanned");
      setMessage("Request received");
    });

    onGeneratingProof(() => {
      console.log("Generating proof");
      setMessage("Generating proof...");
    });

    const proofs: ProofResult[] = [];

    onProofGenerated((result: ProofResult) => {
      console.log("Proof result", result);
      proofs.push(result);
      setMessage(`Proofs received`);
      setRequestInProgress(false);
    });

    onResult(async ({ result, uniqueIdentifier, verified, queryResultErrors }) => {
      console.log("Result of the query", result);
      console.log("Query result errors", queryResultErrors);
      
      // Store the verification results in state
      setFirstName(result?.firstname?.disclose?.result);
      setIsEUCitizen(result?.issuing_country?.in?.result);
      setIsOver18(result?.age?.gte?.result);
      setMessage("Result received");
      setUniqueIdentifier(uniqueIdentifier || "");
      setVerified(verified);
      setRequestInProgress(false);
      
      // If age verification is successful, send the message with the RESULT data directly
      if (result?.age?.gte?.result === true) {
        // Create the verification data directly from the result
        const verificationData = {
          firstName: result.firstname?.disclose?.result || "",
          isOver18: result.age?.gte?.result === true,
          isEUCitizen: result.issuing_country?.in?.result === true,
          documentType: result.document_type?.disclose?.result || "",
          uniqueIdentifier: uniqueIdentifier || "",
          verified: verified === true
        };
        
        console.log("Sending verification data:", verificationData);
        await sendMessageWithData(verificationData);
      }
    });

    onReject(() => {
      console.log("User rejected");
      setMessage("User rejected the request");
      setRequestInProgress(false);
    });

    onError((error: unknown) => {
      console.error("Error", error);
      setMessage("An error occurred");
      setRequestInProgress(false);
    });
  };

  // Function to send message with provided verification data
  const sendMessageWithData = async (verificationData: any) => {
    setTxStatus("Sending message with verification data...");
    setTxHash("");
    
    try {
      // Call the API route with the provided verification data
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(verificationData)
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("API response:", data);
      
      if (data.success) {
        setTxStatus("Message sent successfully!");
        setTxHash(data.txHash);
        
        // Start polling after successful message sending
        startPollingArbitrumMessage();
      } else {
        setTxStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setTxStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Legacy function to maintain compatibility with existing code
  const sendMessage = async () => {
    setTxStatus("Sending message...");
    setTxHash("");
    
    try {
      // Collect verification data from state
      const verificationData = {
        firstName: firstName || "",
        isOver18: isOver18 === true,
        isEUCitizen: isEUCitizen === true,
        documentType: "", // We don't have this in state
        uniqueIdentifier: uniqueIdentifier || "",
        verified: verified === true
      };
      
      console.log("Sending verification data from state:", verificationData);
      
      // Call the API route with verification data
      const response = await fetch('/api/send-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(verificationData)
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(data);
      
      if (data.success) {
        setTxStatus("Message sent successfully!");
        setTxHash(data.txHash);
        
        // Start polling after successful message sending
        startPollingArbitrumMessage();
      } else {
        setTxStatus(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setTxStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  // Function to start polling for Arbitrum message
  const startPollingArbitrumMessage = () => {
    // Stop any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    setIsPolling(true);
    setTxStatus(prevStatus => `${prevStatus} - Polling for Arbitrum message...`);
    
    // Get the address to check
    // If uniqueIdentifier is an address, use it; otherwise use a default
    let addressToCheck = uniqueIdentifier;
    
    // If the uniqueIdentifier is not a valid Ethereum address, use default
    if (!addressToCheck || !addressToCheck.match(/^(0x)?[0-9a-fA-F]{40}$/)) {
      addressToCheck = process.env.NEXT_PUBLIC_DEFAULT_ADDRESS || "0x94dFeceb91678ec912ef8f14c72721c102ed2Df7";
    }
    
    // Ensure it has 0x prefix
    if (!addressToCheck.startsWith('0x')) {
      addressToCheck = `0x${addressToCheck}`;
    }
    
    console.log(`Polling for Arbitrum message at address: ${addressToCheck}`);
    
    // Start polling
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch('/api/get-arbitrum-message', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ address: addressToCheck })
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        console.log("Polling response:", data);
        
        if (data.success && (data.decodedMessage || data.message) && data.message !== "0x") {
          // We found a non-empty message, prioritize the decoded message if available
          setArbitrumMessage(data.decodedMessage || data.message);
          setTxStatus("Arbitrum message received!");
          setIsPolling(false);
          
          // Stop polling
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch (error) {
        console.error("Error polling Arbitrum message:", error);
        setTxStatus(`Error polling: ${error instanceof Error ? error.message : "Unknown error"}`);
        
        // Stop polling on error to prevent continuous error messages
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsPolling(false);
      }
    }, parseInt(process.env.NEXT_PUBLIC_POLLING_INTERVAL || "5000")); // Poll using configured interval or default to 5 seconds
  };

  // Function to manually stop polling
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
    setTxStatus(prevStatus => `${prevStatus} - Polling stopped.`);
  };

  // Format the arbitrum message for display
  const formatMessage = (message: string | null): string => {
    if (!message) return "";
    
    // If it's already a string, return it
    if (typeof message === 'string') {
      // Check if it looks like a hex string that needs decoding
      if (message.startsWith('0x')) {
        return "Message verified from blockchain";
      }
      return message;
    }
    
    // If it's an object with decodedMessage, return that
    if (typeof message === 'object' && message !== null) {
      return (message as any).decodedMessage || "Message verified from blockchain";
    }
    
    // Fallback
    return JSON.stringify(message);
  };

  return (
    <main className="w-full h-full flex flex-col items-center p-10">
      {queryUrl && <QRCode className="mb-4" value={queryUrl} />}
      {message && <p>{message}</p>}
      {firstName && (
        <p className="mt-2">
          <b>Firstname:</b> {firstName}
        </p>
      )}
      {typeof isEUCitizen === "boolean" && (
        <p className="mt-2">
          <b>Is EU citizen:</b> {isEUCitizen ? "Yes" : "No"}
        </p>
      )}
      {typeof isOver18 === "boolean" && (
        <p className="mt-2">
          <b>Is over 18:</b> {isOver18 ? "Yes" : "No"}
        </p>
      )}
      {uniqueIdentifier && (
        <p className="mt-2">
          <b>Unique identifier:</b>
        </p>
      )}
      {uniqueIdentifier && <p>{uniqueIdentifier}</p>}
      {verified !== undefined && (
        <p className="mt-2">
          <b>Verified:</b> {verified ? "Yes" : "No"}
        </p>
      )}
      
      {/* Transaction status and hash display */}
      {txStatus && (
        <p className="mt-4 font-bold">
          {txStatus}
        </p>
      )}
      {txHash && (
        <p className="mt-2">
          <b>Transaction Hash:</b> {txHash}
        </p>
      )}
      
      {/* Arbitrum Message Display */}
      {arbitrumMessage && (
        <div className="mt-4 p-4 bg-gray-100 rounded-lg w-full max-w-2xl">
          <p className="font-bold text-lg mb-2">Cross-Chain Message Verification:</p>
          <div className="bg-white p-4 rounded-md shadow-sm">
            <p className="text-lg font-medium text-green-600">{formatMessage(arbitrumMessage)}</p>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            This message was securely transmitted across blockchains using Wormhole protocol
          </p>
        </div>
      )}
      
      <div className="flex flex-row gap-4 mt-4">
        {!requestInProgress && (
          <button
            className="p-4 bg-gray-500 rounded-lg text-white font-medium"
            onClick={createRequest}
          >
            Generate new request
          </button>
        )}
        
        {/* Polling Control Button */}
        {txHash && (
          <button
            className={`p-4 rounded-lg text-white font-medium ${isPolling ? 'bg-red-500' : 'bg-blue-500'}`}
            onClick={isPolling ? stopPolling : startPollingArbitrumMessage}
          >
            {isPolling ? 'Stop Polling' : 'Start Polling'}
          </button>
        )}
      </div>
    </main>
  );
}