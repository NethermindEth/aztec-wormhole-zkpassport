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

    console.log("Original txHash received:", txHash);

    // Ensure the txHash is properly formatted
    try {
      // Make sure it's a valid hash
      if (!txHash.startsWith('0x')) {
        txHash = `0x${txHash}`;
      }
      
      // Convert to bytes32 format for the contract call
      const bytes32TxHash = to32ByteHex(txHash);
      console.log("Converted to bytes32:", bytes32TxHash);
      
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
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x009cbB8f91d392856Cb880d67c806Aa731E3d686";
    
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
      
      // Convert txHash to bytes32 format for the contract call
      const bytes32TxHash = to32ByteHex(txHash);
      
      // Encode the function call
      const callData = contractInterface.encodeFunctionData("getArbitrumMessage", [bytes32TxHash]);
      console.log("Encoded call data:", callData);
      console.log("Using txHash as bytes32:", bytes32TxHash);
      
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
          console.log("Attempting to decode as uint256...");
          
          // Use ethers to properly decode the uint256 result
          const decodedResult = contractInterface.decodeFunctionResult("getArbitrumMessage", rawResult);
          const amount = decodedResult[0]; // First (and only) return value
          
          console.log("Decoded amount:", amount.toString());
          
          // Convert BigInt to regular number for JSON serialization
          const amountNumber = Number(amount);
          
          return NextResponse.json({
            success: true,
            message: rawResult,
            txHash: txHash,
            rawResult: rawResult,
            parsedData: {
              txHash: txHash,
              amount: amountNumber.toString(),
              rawData: [amount.toString()]
            }
          });
        } catch (decodeError) {
          console.error("Failed to decode as uint256, trying manual parsing:", decodeError);
          
          // Fallback: try to parse the raw result manually
          // If rawResult is a proper hex string representing a uint256
          try {
            const bigIntAmount = BigInt(rawResult);
            const amountNumber = Number(bigIntAmount);
            
            console.log("Manual parsing result:", amountNumber);
            
            return NextResponse.json({
              success: true,
              message: rawResult,
              txHash: txHash,
              rawResult: rawResult,
              parsedData: {
                txHash: txHash,
                amount: amountNumber.toString(),
                rawData: [bigIntAmount.toString()]
              }
            });
          } catch (manualParseError) {
            console.error("Manual parsing also failed:", manualParseError);
            
            // If all else fails, return the raw result
            return NextResponse.json({
              success: true,
              message: rawResult,
              txHash: txHash,
              rawResult: rawResult,
              parsedData: {
                txHash: txHash,
                amount: "0", // Default to 0 if we can't parse
                rawData: [rawResult.substring(2)]
              }
            });
          }
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