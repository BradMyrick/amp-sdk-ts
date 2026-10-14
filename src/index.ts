/**
 * @amp/sdk — Avalanche Tournament & Bracket SDK.
 *
 * Built on Avalanche Fuji ($15,000 Avalanche Build Games grant winner).
 * Complete, standalone SDK for on-chain tournament prize-pool escrow (AMPTournamentCup.sol),
 * EIP-712 verifier attestations, pull-payment prize claims, and zero-dependency bracket engine
 * (Single Elimination, Swiss, Round Robin).
 *
 * @example
 * ```typescript
 * import { AMPTournamentClient, Tournament, TournamentState, PAYOUT_PRESETS } from "@amp/sdk";
 * import { ethers } from "ethers";
 *
 * // 1. Run local bracket engine (zero network calls)
 * const tournament = Tournament.new({ kind: TournamentState.SingleElimination }, [
 *   { id: 1, seed: 1 },
 *   { id: 2, seed: 2 },
 * ]);
 *
 * // 2. Interact with on-chain cup on Avalanche Fuji
 * const client = new AMPTournamentClient({
 *   signer: new ethers.Wallet(privateKey),
 * });
 *
 * const cup = await client.getTournament(1);
 * console.log(`Prize Pool: ${cup.prizePoolFormatted} AVAX`);
 * ```
 */

// ───────────────────────── Primary Tournament Client ─────────────────────────
export { AMPTournamentClient } from "./client/tournament.js";
export type {
  AMPTournamentClientOptions,
  TournamentDetails,
  ClaimableInfo,
} from "./client/tournament.js";

// ───────────────────────── Built-in Bracket Engine ─────────────────────────
export {
  Tournament,
  TournamentState,
  TournamentError,
  Side,
  Outcome,
  SwissEntry,
  pairSwissRound,
  buildSingleElim,
  buildRoundRobin,
  bitReverse,
  seedSlots,
  nextPow2,
  isReady,
  isBye,
  matchSide,
  matchWinner,
  outcomeWinner,
  entrantSeedCmp,
} from "./engine/index.js";

export type {
  BracketMatch,
  Entrant,
  MatchId,
  Standing,
  TournamentFormat,
} from "./engine/index.js";

// ───────────────────────── Signers ─────────────────────────
export { InjectedWalletSigner, PrivateKeySigner } from "./signers/index.js";
export type {
  AMPSigner,
  AMPCustodialProvider,
  AMPAuth,
  TypedData,
  TypedDataDomain,
  TypedDataTypes,
  TypedDataMessage,
} from "./types/signer.js";

// ───────────────────────── Constants & ABI ─────────────────────────
export {
  DEFAULT_CUP_ADDRESS,
  DEFAULT_FUJI_CHAIN_ID,
  DEFAULT_FUJI_RPC,
  DEFAULT_EXPLORER_URL,
  AMP_TOURNAMENT_CUP_ABI,
  CupState,
  PAYOUT_PRESETS,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  TOURNAMENT_RESULT_TYPES,
} from "./constants.js";

// ───────────────────────── Crypto & Attestation Helpers ─────────────────────────
export {
  signFinalize,
  verifyFinalizeSignature,
  computeFinalizeDigest,
  hashWinners,
  buildFinalizeTypedData,
  validateAndChecksumAddress,
  validateAndChecksumAddresses,
  computeCommitHash,
  generateSalt,
  buildLadderTypedData,
  buildReportMessage,
  buildExitCertMessage,
  toHex,
} from "./crypto/helpers.js";

// ───────────────────────── Legacy Matchmaking Client & Types ─────────────────────────
export { AMPClient } from "./client/amp.js";
export type { AMPClientOptions } from "./client/amp.js";
export { AMPError } from "./types/api.js";
export type {
  Player,
  PlayerRating,
  GameInfo,
  QueueStatus,
  MatchFound,
  MatchView,
  MatchResult,
  PartyInfo,
  MultiMatch,
  MultiLobbyFormed,
  WsEventMap,
  WsEventType,
} from "./types/api.js";
