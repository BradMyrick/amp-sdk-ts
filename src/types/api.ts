/**
 * API response types — mirror the amp-server's JSON payloads exactly.
 */

export interface Player {
  wallet: string;
  region: string;
  language: string;
}

export interface PlayerRating {
  gameId: string;
  rulesetId: string;
  rating: number;
  deviation: number;
  wins: number;
  losses: number;
  draws: number;
}

export interface GameInfo {
  id: string;
  name: string;
  rulesets: {
    id: string;
    name: string;
    queueDepth: number;
  }[];
  nextQueueWindowUtc?: string;
}

export interface QueueStatus {
  queued: boolean;
  depth?: number;
  waitedMs?: number;
  skillWindow?: number;
}

export interface MatchFound {
  matchId: string;
  gameId: string;
  rulesetId: string;
  bot: boolean;
  opponent: {
    wallet: string;
    rating: number;
    region: string;
  };
  yourRating: number;
  expiresAt: string;
}

export interface MatchView {
  matchId: string;
  gameId: string;
  rulesetId: string;
  state: string;
  stakeWei: number;
  bot: boolean;
  you: { wallet: string; ratingSnapshot: unknown };
  opponent: { wallet: string; ratingSnapshot: unknown };
  outcome: string | null;
  winner: string | null;
  attestation: unknown;
  onChainMatchId: number | null;
  settleDeadline: string | null;
  expiresAt: string;
}

export interface MatchResult {
  matchId: string;
  outcome: string;
  won: boolean;
  you: {
    ratingBefore: number;
    ratingAfter: number;
    deviationAfter: number;
  };
  opponent: {
    ratingBefore: number;
    ratingAfter: number;
  };
  attestation: unknown;
}

export interface PartyInfo {
  partyId: string;
  leader: string;
  members: {
    wallet: string;
    region: string;
    acceptedAt: string;
  }[];
  state: string;
  inviteCode: string;
  gameId: string;
  rulesetId: string;
}

export interface MultiMatch {
  matchId: string;
  state: string;
  lobbySize: number;
  stakePerPlayer: number;
  bondPerPlayer: number;
  players: {
    wallet: string;
    index: number;
    rating: number;
    region: string;
  }[];
  ladder?: [string, number][];
  signerCount: number;
  quorumNeeded: number;
  reportCount: number;
  quorumUntil?: string;
}

export interface MultiLobbyFormed {
  matchId: string;
  lobbySize: number;
  stakeWei: number;
  bondWei: number;
  sessionNonce: number;
  multiplayerAddress: string;
  chainId: number;
}

export interface MultiResult {
  matchId: string;
  outcome: {
    ratingBefore: number;
    ratingAfter: number;
    delta: number;
  };
}

// ── WebSocket event payloads ─────────────────────────

export interface WsHello {
  wallet: string;
}

export interface WsQueueStatus {
  depth: number;
  waitedMs: number;
  skillWindow: number;
}

export interface WsMatchUpdate {
  matchId: string;
  state: string;
  reason?: string;
}

export interface WsMultiCancelled {
  matchId: string;
  reason: string;
}

export type WsEventMap = {
  hello: WsHello;
  queue_status: WsQueueStatus;
  match_found: MatchFound;
  match_result: MatchResult;
  match_update: WsMatchUpdate;
  multi_lobby_formed: MultiLobbyFormed;
  multi_result: MultiResult;
  multi_cancelled: WsMultiCancelled;
};

export type WsEventType = keyof WsEventMap;

// ── Error type ───────────────────────────────────────

export class AMPError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 0,
  ) {
    super(message);
    this.name = "AMPError";
  }
}
