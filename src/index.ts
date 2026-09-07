/**
 * @amp/sdk — Avalanche Matchmaking Protocol SDK for TypeScript.
 *
 * Integrate ranked matchmaking, skill ratings, and on-chain settlement
 * into your game in minutes.
 *
 * @example
 * ```typescript
 * import { AMPClient, InjectedWalletSigner } from "@amp/sdk";
 *
 * const amp = new AMPClient({
 *   serverUrl: "https://amp.playwithamp.xyz",
 *   signer: new InjectedWalletSigner(),
 * });
 *
 * await amp.login();
 * await amp.joinQueue("amp-tactics", "ranked-1v1");
 *
 * amp.events.on("match_found", async (match) => {
 *   // Start your game
 *   const result = await playGame(match);
 *   await amp.reportMatch(match.matchId, result);
 * });
 * ```
 */

// Main client
export { AMPClient } from "./client/amp.js";
export type { AMPClientOptions } from "./client/amp.js";

// Signer interfaces
export type { AMPSigner, AMPCustodialProvider, TypedData } from "./types/signer.js";

// Built-in signers
export { InjectedWalletSigner, PrivateKeySigner } from "./signers/index.js";

// API types
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
export { AMPError } from "./types/api.js";

// Crypto helpers
export {
  computeCommitHash,
  generateSalt,
  buildLadderTypedData,
  buildReportMessage,
  buildExitCertMessage,
  toHex,
} from "./crypto/helpers.js";
