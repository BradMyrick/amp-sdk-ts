/**
 * Crypto helpers — EIP-712 hashing, typed data signing, verifier signatures,
 * commit hashes, and address checksum validation.
 */

import { ethers } from "ethers";
import type { AMPSigner, TypedData } from "../types/signer.js";
import {
  DEFAULT_CUP_ADDRESS,
  DEFAULT_FUJI_CHAIN_ID,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  TOURNAMENT_RESULT_TYPES,
} from "../constants.js";

/**
 * Validate and checksum an Ethereum address.
 * Throws an error if invalid format.
 */
export function validateAndChecksumAddress(address: string): string {
  try {
    return ethers.getAddress(address);
  } catch {
    throw new Error(`Invalid Ethereum address: "${address}"`);
  }
}

/**
 * Validate and checksum an array of Ethereum addresses.
 */
export function validateAndChecksumAddresses(addresses: string[]): string[] {
  return addresses.map((addr) => validateAndChecksumAddress(addr));
}

/**
 * Encodes and hashes an array of winner addresses for EIP-712.
 * Matches `_hashWinners` in AMPTournamentCup.sol:
 * keccak256(abi.encodePacked(bytes32(uint256(uint160(winners[i])))...))
 */
export function hashWinners(winners: string[]): string {
  const checksummed = validateAndChecksumAddresses(winners);
  const words = checksummed.map((w) => ethers.zeroPadValue(w, 32));
  return ethers.keccak256(ethers.concat(words));
}

/**
 * Build EIP-712 TypedData structure for finalization.
 */
export function buildFinalizeTypedData(params: {
  tournamentId: number | bigint;
  winners: string[];
  chainId?: number;
  contractAddress?: string;
}): TypedData {
  const checksummedWinners = validateAndChecksumAddresses(params.winners);
  return {
    domain: {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: params.chainId ?? DEFAULT_FUJI_CHAIN_ID,
      verifyingContract: validateAndChecksumAddress(
        params.contractAddress ?? DEFAULT_CUP_ADDRESS
      ),
    },
    types: {
      TournamentResult: [
        { name: "tournamentId", type: "uint256" },
        { name: "winners", type: "address[]" },
      ],
    },
    primaryType: "TournamentResult",
    message: {
      tournamentId: BigInt(params.tournamentId),
      winners: checksummedWinners,
    },
  };
}

/**
 * Compute the 32-byte EIP-712 digest for tournament finalization.
 * Matches `_hashTypedDataV4(structHash)` in AMPTournamentCup.sol.
 */
export function computeFinalizeDigest(params: {
  tournamentId: number | bigint;
  winners: string[];
  chainId?: number;
  contractAddress?: string;
}): string {
  const typedData = buildFinalizeTypedData(params);
  return ethers.TypedDataEncoder.hash(
    typedData.domain,
    TOURNAMENT_RESULT_TYPES,
    typedData.message
  );
}

/**
 * Sign an EIP-712 tournament result attestation using an ethers.Signer or AMPSigner.
 */
export async function signFinalize(
  signer: ethers.Signer | AMPSigner,
  tournamentId: number | bigint,
  winners: string[],
  options?: {
    chainId?: number;
    contractAddress?: string;
  }
): Promise<string> {
  const typedData = buildFinalizeTypedData({
    tournamentId,
    winners,
    chainId: options?.chainId,
    contractAddress: options?.contractAddress,
  });

  if ("signTypedData" in signer && typeof signer.signTypedData === "function") {
    // Check if it's an ethers.Signer (signature: (domain, types, value))
    // vs AMPSigner (signature: (typedData: TypedData))
    if ("provider" in signer || "address" in signer || "signTransaction" in signer) {
      return (signer as ethers.Signer).signTypedData(
        typedData.domain,
        TOURNAMENT_RESULT_TYPES,
        typedData.message
      );
    }
    // AMPSigner path
    return (signer as AMPSigner).signTypedData(typedData);
  }

  throw new Error("Provided signer does not support signTypedData.");
}

/**
 * Recover the signer address from an EIP-712 finalization signature.
 */
export function verifyFinalizeSignature(
  tournamentId: number | bigint,
  winners: string[],
  signature: string,
  options?: {
    chainId?: number;
    contractAddress?: string;
  }
): string {
  const digest = computeFinalizeDigest({
    tournamentId,
    winners,
    chainId: options?.chainId,
    contractAddress: options?.contractAddress,
  });
  return ethers.recoverAddress(digest, signature);
}

/**
 * Compute the commit-reveal hash: keccak256(address ‖ stake ‖ salt).
 * Matches the amp-server's `compute_commit` function byte-for-byte.
 */
export async function computeCommitHash(
  wallet: string,
  stakeWei: number | bigint,
  salt: string
): Promise<string> {
  const addrBytes = ethers.getBytes(validateAndChecksumAddress(wallet));
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
      verifyingContract: validateAndChecksumAddress(params.contractAddress),
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
      rankedPlacements: validateAndChecksumAddresses(params.rankedPlacements),
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
 * Build the EIP-191 message for a multiplayer exit certificate
 * (death cert). Matches the amp-server's `submit_exit_cert`.
 */
export function buildExitCertMessage(
  matchId: string,
  rank: number,
  exitFrame: number,
  stateHash: string
): string {
  return (
    `AMP exit certificate\n\n` +
    `Match: ${matchId}\n` +
    `Rank: ${rank}\n` +
    `Exit frame: ${exitFrame}\n` +
    `State hash: ${stateHash}\n\n` +
    `This signature is free. It certifies your elimination and unlocks your reporting bond.`
  );
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
