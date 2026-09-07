/**
 * Crypto helpers — commit hashes, EIP-712 ladder typed data, and EIP-191
 * message formatting. Uses ethers.js if available; falls back to
 * Web Crypto API for hashing when ethers is not installed.
 */

import type { TypedData } from "../types/signer.js";

/**
 * Compute the commit-reveal hash: keccak256(address ‖ stake ‖ salt).
 * Matches the amp-server's `compute_commit` function byte-for-byte.
 *
 * Requires ethers.js (peer dependency).
 */
export async function computeCommitHash(
  wallet: string,
  stakeWei: number | bigint,
  salt: string,
): Promise<string> {
  const { ethers } = await import("ethers");

  const addrBytes = ethers.getBytes(ethers.getAddress(wallet));
  const stakeBytes = ethers.toBeHex(BigInt(stakeWei), 8);
  const saltBytes = ethers.toUtf8Bytes(salt);
  const concatenated = ethers.concat([
    addrBytes,
    ethers.getBytes(stakeBytes),
    saltBytes,
  ]);
  return ethers.keccak256(concatenated);
}

/**
 * Generate a cryptographically random salt for commit-reveal.
 * Returns 32 bytes as a hex string (0x-prefixed).
 */
export function generateSalt(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Build the EIP-712 typed data for a MultiplayerLadder signature.
 * Matches the amp-server's `ladder.rs` and the AMPMultiplayer contract.
 */
export function buildLadderTypedData(params: {
  chainId: number;
  contractAddress: string;
  matchId: string;
  gameId: string;
  rankedPlacements: string[];
  transcriptHash: string;
  sessionNonce: number | bigint;
}): TypedData {
  return {
    domain: {
      name: "AMPMultiplayer",
      version: "1",
      chainId: params.chainId,
      verifyingContract: params.contractAddress,
    },
    types: {
      MultiplayerLadder: [
        { name: "matchId", type: "bytes32" },
        { name: "gameId", type: "bytes32" },
        { name: "rankedPlacements", type: "address[]" },
        { name: "transcriptHash", type: "bytes32" },
        { name: "sessionNonce", type: "uint256" },
      ],
    },
    primaryType: "MultiplayerLadder",
    message: {
      matchId: params.matchId,
      gameId: params.gameId,
      rankedPlacements: params.rankedPlacements,
      transcriptHash: params.transcriptHash,
      sessionNonce: params.sessionNonce,
    },
  };
}

/**
 * Build the EIP-191 message for a 1v1 match report.
 * Matches the amp-server's `report_message` function.
 */
export function buildReportMessage(matchId: string, result: string): string {
  return `AMP_REPORT:v1:${matchId}:${result}`;
}

/**
 * Convert a UTF-8 string to hex (for personal_sign params).
 */
export function toHex(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return (
    "0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}
