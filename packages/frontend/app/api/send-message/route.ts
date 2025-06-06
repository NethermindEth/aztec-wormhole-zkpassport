// app/api/send-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    // Parse the verification data from request
    let verificationData = null;
    try {
      const requestData = await request.json();
      verificationData = Object.keys(requestData).length > 0 ? requestData : {};
    } catch (e) {
      verificationData = {};
    }
    
    // Check if we have any verification data
    const hasData = Object.keys(verificationData).length > 0;
    const hasProofs = verificationData && verificationData.formattedProofs;
    
    if (!hasData) {
      return NextResponse.json({
        success: false,
        error: "No verification data provided"
      }, { status: 400 });
    }
    
    // Encode the verification data for safe command line transport
    try {
      // Create a safe copy of the verification data that handles BigInt values
      const safeVerificationData = JSON.parse(
        JSON.stringify(verificationData, (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString();
          }
          return value;
        })
      );
      
      const encodedData = Buffer.from(JSON.stringify(safeVerificationData)).toString('base64');
      
      // Path to your existing script
      const scriptPath = path.join(process.cwd(), '/app/contracts/send-message.mjs');
      
      // Check if the script exists
      if (!fs.existsSync(scriptPath)) {
        console.error(`Script not found at path: ${scriptPath}`);
        return NextResponse.json({
          success: false,
          error: `Script not found at path: ${scriptPath}`
        }, { status: 500 });
      }
      
      try {
        // Execute your script with the verification data as an environment variable
        const { stdout, stderr } = await execPromise(`node ${scriptPath}`, {
          timeout: 120000, // 2 minute timeout
          env: {
            ...process.env,
            VERIFICATION_DATA: encodedData,
            HAS_MEANINGFUL_DATA: "true",
            HAS_ZK_PROOFS: hasProofs ? "true" : "false"
          }
        });
        
        if (stderr && !stderr.includes("deprecated in import statements")) {
          console.warn("Script warnings:", stderr);
        }
        
        // Check for different transaction hash formats
        const newTxHashMatch = stdout.match(/hash: Fr<(0x[0-9a-fA-F]+)>/);
        const oldTxHashMatch = stdout.match(/Transaction sent! Hash: (0x[0-9a-fA-F]+)/);
        const anyTxHashMatch = stdout.match(/(0x[0-9a-fA-F]{64})/);
        
        let txHash;
        if (newTxHashMatch && newTxHashMatch[1]) {
          txHash = newTxHashMatch[1];
        } else if (oldTxHashMatch && oldTxHashMatch[1]) {
          txHash = oldTxHashMatch[1];
        } else if (anyTxHashMatch && anyTxHashMatch[1]) {
          txHash = anyTxHashMatch[1];
        }
        
        if (txHash) {
          return NextResponse.json({
            success: true,
            txHash: txHash,
            message: hasProofs 
              ? "Verification data and ZK proofs sent to contract successfully" 
              : "Verification data sent to contract successfully",
            hasZKProofs: hasProofs
          });
        } else {
          // If we can't find a transaction hash but the script completed successfully
          if (stdout.includes("Calling emitter verify and publish") && 
              stdout.includes("blockNumber:")) {
            return NextResponse.json({
              success: true,
              message: hasProofs 
                ? "Verification and ZK proofs sent successfully, but transaction hash could not be extracted"
                : "Verification sent successfully, but transaction hash could not be extracted",
              rawOutput: stdout.substring(stdout.length - 500),
              hasZKProofs: hasProofs
            });
          }
          
          console.error("Could not find transaction hash in output");
          return NextResponse.json({
            success: false,
            error: "Could not extract transaction hash from output",
            rawOutput: stdout.substring(stdout.length - 500),
            hasZKProofs: hasProofs
          }, { status: 500 });
        }
      } catch (error) {
        console.error("Error executing script:", error);
        let errorMessage = "Unknown error";
        let errorOutput = "";
        
        if (error instanceof Error) {
          errorMessage = error.message;
          if ('stdout' in error && typeof error.stdout === 'string') {
            errorOutput = error.stdout;
          }
          if ('stderr' in error && typeof error.stderr === 'string') {
            errorOutput += "\n" + error.stderr;
          }
        }
        
        return NextResponse.json({
          success: false,
          error: errorMessage,
          errorOutput: errorOutput || undefined,
          hasZKProofs: hasProofs
        }, { status: 500 });
      }
    } catch (jsonError) {
      console.error("Error converting verification data to JSON:", jsonError);
      return NextResponse.json({
        success: false,
        error: `Error converting verification data to JSON: ${jsonError instanceof Error ? jsonError.message : "Unknown error"}`
      }, { status: 500 });
    }
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}