// app/api/get-arbitrum-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { ethers } from 'ethers';

// ABI for the contract function to get amount by txID
const vaultGettersABI = [
  {
    "type": "function",
    "name": "getArbitrumMessage",
    "inputs": [
      {
        "name": "arbitrumAddress",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  }
];

// Define an interface for the error type
interface EthersError extends Error {
  code?: string;
  value?: string;
  reason?: string;
  data?: string;
}

// Function to convert a hex value to 32-byte representation
function to32ByteHex(hexString: string): string {
  // Remove 0x prefix if present
  let hex = hexString.startsWith('0x') ? hexString.substring(2) : hexString;
  
  // Pad to 64 characters (32 bytes)
  hex = hex.padStart(64, '0');
  
  return '0x' + hex;
}

export async function POST(request: NextRequest) {
  try {
    // Parse the request body
    const body = await request.json();
    let { txHash } = body;
    
    if (!txHash) {
      return NextResponse.json({
        success: false,
        error: "Transaction hash is required"
      }, { status: 400 });
    }

    // Ensure the txHash is properly formatted
    try {
      // Make sure it's a valid hash
      if (!txHash.startsWith('0x')) {
        txHash = `0x${txHash}`;
      }
      
      // Validate the hash and convert to bytes32 format
      txHash = to32ByteHex(txHash);
      
    } catch (hashError) {
      console.error("Invalid transaction hash format:", hashError);
      return NextResponse.json({
        success: false,
        error: "Invalid transaction hash format"
      }, { status: 400 });
    }
    
    // Set up connection to the blockchain
    const provider = new ethers.JsonRpcProvider(
      process.env.NEXT_PUBLIC_RPC_URL || "http://localhost:8545"
    );
    
    // Use the actual contract address
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0xb111Ded3F2e4012C0B85D930Fda298693D0DA0B2";
    
    try {
      // First verify if the contract exists at this address
      const code = await provider.getCode(contractAddress);
      if (code === '0x' || !code) {
        return NextResponse.json({
          success: false,
          error: "No contract deployed at the specified address"
        }, { status: 400 });
      }
      
      // Create a contract interface for encoding/decoding
      const contractInterface = new ethers.Interface(vaultGettersABI);
      
      // Encode the function call - Now passing txHash directly as the argument
      const callData = contractInterface.encodeFunctionData("getArbitrumMessage", [txHash]);
      console.log("Encoded call data:", callData);
      
      // Make a low-level call
      try {
        const rawResult = await provider.call({
          to: contractAddress,
          data: callData
        });
        
        console.log("Raw result from call:", rawResult);
        
        // Check if the raw result is null or just zeros (indicating no data found)
        if (!rawResult || rawResult === '0x' || rawResult === '0x0000000000000000000000000000000000000000000000000000000000000000') {
          return NextResponse.json({
            success: true,
            message: null,
            txHash: txHash,
            rawResult: rawResult,
            note: "No amount found for this transaction hash"
          });
        }
        
        // Try to decode the result as a uint256 (amount)
        try {
          const decodedResult = contractInterface.decodeFunctionResult("getArbitrumMessage", rawResult);
          console.log("Decoded result:", decodedResult);
          
          // The first element of decodedResult should be our uint256 amount
          const amount = decodedResult[0];
          
          // Convert to a hex string for consistent handling
          const amountHex = '0x' + amount.toString(16).padStart(64, '0');
          
          // Return the amount value
          return NextResponse.json({
            success: true,
            message: amountHex,
            txHash: txHash,
            rawResult: rawResult,
            parsedData: {
              txHash: txHash,
              amount: amount.toString(),
              rawData: [amount.toString(16).padStart(64, '0')] // Format as 32-byte hex
            }
          });
        } catch (decodeError) {
          console.error("Failed to decode result:", decodeError);
          
          // If we couldn't decode it as a uint256, just return the raw result
          return NextResponse.json({
            success: true,
            message: rawResult,
            txHash: txHash,
            rawResult: rawResult,
            parsedData: {
              txHash: txHash,
              rawData: [rawResult.substring(2)] // Just return the raw value as a single chunk
            }
          });
        }
      } catch (callError) {
        console.error("Low-level call failed:", callError);
        
        // Check if the call reverted with a reason
        const error = callError as EthersError;
        
        return NextResponse.json({
          success: false,
          error: `Low-level call error: ${error.message || "Unknown error during call"}`,
          code: error.code,
          reason: error.reason,
          txHash: txHash,
          details: error.toString?.() || JSON.stringify(error)
        }, { status: 500 });
      }
    } catch (contractError) {
      console.error("Contract error:", contractError);
      
      const error = contractError as EthersError;
      return NextResponse.json({
        success: false,
        error: `Contract error: ${error.message || "Unknown contract error"}`,
        code: error.code,
        reason: error.reason,
        details: error.toString?.() || JSON.stringify(error)
      }, { status: 500 });
    }
  } catch (error: unknown) {
    const genericError = error as Error;
    console.error("Error getting message by txID:", genericError);
    
    return NextResponse.json({
      success: false,
      error: genericError.message || "Unknown error"
    }, { status: 500 });
  }
}