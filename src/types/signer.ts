/**
 * Core signer interfaces — the dual-path wallet model.
 *
 * Path 1 (self-custody): the game injects an `AMPSigner` backed by the
 * player's own wallet (browser extension, private key, hardware).
 *
 * Path 2 (custodial): the game injects an `AMPCustodialProvider` backed by
 * the game studio's backend, which handles fiat↔crypto conversion.
 * AMP never touches fiat — the studio is the bridge.
 */

/** EIP-712 typed data structure for ladder signatures. */
export interface TypedDataDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

export interface TypedDataTypes {
  [type: string]: { name: string; type: string }[];
}

export interface TypedDataMessage {
  [key: string]: unknown;
}

export interface TypedData {
  domain: TypedDataDomain;
  types: TypedDataTypes;
  primaryType: string;
  message: TypedDataMessage;
}

/**
 * Self-custody signer — the player signs with their own wallet.
 * Implement this interface with ethers.js, viem, or any EIP-191/EIP-712 library.
 */
export interface AMPSigner {
  /** The player's Ethereum address (0x-prefixed, checksummed). */
  getAddress(): Promise<string>;

  /** Sign an EIP-191 personal_sign message (used for auth + match reports). */
  signPersonalSign(message: string): Promise<string>;

  /** Sign an EIP-712 typed-data message (used for multiplayer ladders). */
  signTypedData(typedData: TypedData): Promise<string>;
}

/**
 * Custodial provider — the game studio handles fiat on/off-ramping.
 * AMP's smart contracts still handle the escrow and settlement; the
 * studio is the wallet custodian, not AMP.
 */
export interface AMPCustodialProvider {
  /** Get (or create) the player's delegated wallet address. */
  getAddress(playerId: string): Promise<string>;

  /** Sign an EIP-191 message on behalf of the player. */
  signPersonalSign(playerId: string, message: string): Promise<string>;

  /** Sign an EIP-712 typed-data message on behalf of the player. */
  signTypedData(playerId: string, typedData: TypedData): Promise<string>;

  /** Fund a staked match escrow for this player. */
  fundMatch(matchId: string, playerId: string): Promise<void>;

  /** Withdraw settled winnings back to the player (fiat off-ramp). */
  withdrawWinnings(matchId: string, playerId: string): Promise<void>;
}

/** Convenience: any valid signer source. */
export type AMPAuth = AMPSigner | AMPCustodialProvider;
