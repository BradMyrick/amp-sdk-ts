/**
 * AMPClient — the main entry point for the AMP SDK.
 *
 * Handles the full lifecycle: wallet login, queue, match, report, settle.
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
 * await amp.queue.join("amp-tactics", "ranked-1v1");
 *
 * amp.events.on("match_found", (data) => {
 *   console.log(`Matched with ${data.opponent.wallet} (${data.opponent.rating})`);
 * });
 * ```
 */

import { RestClient } from "./rest.js";
import { AMPWebSocket } from "./ws.js";
import type { AMPSigner, AMPCustodialProvider } from "../types/signer.js";
import type {
  Player,
  PlayerRating,
  GameInfo,
  QueueStatus,
  MatchFound,
  MatchView,
  MatchResult,
  PartyInfo,
  MultiMatch,
  WsEventMap,
  WsEventType,
} from "../types/api.js";
import {
  buildReportMessage,
  buildExitCertMessage,
  buildLadderTypedData,
  computeCommitHash,
  generateSalt,
} from "../crypto/helpers.js";

export interface AMPClientOptions {
  /** The amp-server base URL (e.g. "https://amp.playwithamp.xyz"). */
  serverUrl: string;

  /** Self-custody signer (player's wallet) — for web3-native games. */
  signer?: AMPSigner;

  /** Custodial provider (game studio's backend) — for fiat-friendly games. */
  custodial?: AMPCustodialProvider;

  /** Player ID for custodial mode (e.g. their game account ID). */
  playerId?: string;

  /** Request timeout in milliseconds (default: 10_000). */
  timeout?: number;
}

export class AMPClient {
  private rest: RestClient;
  private ws: AMPWebSocket | null = null;
  private signer: AMPSigner | null = null;
  private custodial: AMPCustodialProvider | null = null;
  private playerId: string | null = null;
  private _wallet: string | null = null;

  constructor(opts: AMPClientOptions) {
    this.rest = new RestClient({
      baseUrl: opts.serverUrl,
      timeout: opts.timeout,
    });
    this.signer = opts.signer ?? null;
    this.custodial = opts.custodial ?? null;
    this.playerId = opts.playerId ?? null;
  }

  /** The connected player's wallet address (available after login). */
  get wallet(): string | null {
    return this._wallet;
  }

  /** Whether the client is authenticated. */
  get authenticated(): boolean {
    return this.rest.getToken() !== null;
  }

  // ── Auth ────────────────────────────────────────────

  /**
   * Log in with the configured signer or custodial provider.
   * Handles the challenge → sign → verify flow automatically.
   */
  async login(): Promise<Player> {
    if (!this.signer && !this.custodial) {
      throw new Error("No signer or custodial provider configured");
    }

    // Get the wallet address
    this._wallet = this.signer
      ? await this.signer.getAddress()
      : await this.custodial!.getAddress(this.playerId!);

    // Request a challenge
    const { challenge } = await this.rest.post<{ challenge: string; expiresAt: string }>(
      "/v1/auth/challenge",
      { wallet: this._wallet },
    );

    // Sign the challenge
    const signature = this.signer
      ? await this.signer.signPersonalSign(challenge)
      : await this.custodial!.signPersonalSign(this.playerId!, challenge);

    // Verify and get session token
    const { token } = await this.rest.post<{ token: string; player: Player }>(
      "/v1/auth/verify",
      { wallet: this._wallet, signature, challenge },
    );

    this.rest.setToken(token);
    return { wallet: this._wallet, region: "na", language: "en" };
  }

  /** Log out and clear the session. */
  logout(): void {
    this.rest.setToken(null);
    this._wallet = null;
    this.ws?.close();
    this.ws = null;
  }

  // ── Player info ─────────────────────────────────────

  /** Get the authenticated player's info and ratings. */
  async me(): Promise<{
    wallet: string;
    ratings: PlayerRating[];
    liveMatchId: string | null;
  }> {
    return this.rest.get("/v1/me");
  }

  /** Get any player's public profile (ratings + match history). */
  async getPlayer(wallet: string): Promise<{
    wallet: string;
    ratings: PlayerRating[];
    matches: MatchView[];
  }> {
    return this.rest.get(`/v1/players/${wallet}`);
  }

  // ── Games ───────────────────────────────────────────

  /** List available games with live queue depth. */
  async games(): Promise<{
    games: GameInfo[];
    stakingEnabled: boolean;
    chainId: number;
  }> {
    return this.rest.get("/v1/games");
  }

  // ── Queue ───────────────────────────────────────────

  /** Join a ranked queue. */
  async joinQueue(gameId: string, rulesetId: string): Promise<{
    ticketId: string;
    queueDepth: number;
    skillWindow: number;
  }> {
    return this.rest.post("/v1/queue/join", { gameId, rulesetId });
  }

  /** Leave the queue. */
  async leaveQueue(): Promise<{ left: boolean }> {
    return this.rest.post("/v1/queue/leave");
  }

  /** Get current queue status. */
  async queueStatus(): Promise<QueueStatus> {
    return this.rest.get("/v1/queue/status");
  }

  /** Skip the queue wait and play a bot immediately. */
  async playBot(): Promise<{ matchId: string; bot: boolean }> {
    return this.rest.post("/v1/queue/play-bot");
  }

  // ── Matches (1v1) ───────────────────────────────────

  /** Get a match by ID. */
  async getMatch(matchId: string): Promise<MatchView> {
    return this.rest.get(`/v1/matches/${matchId}`);
  }

  /** Get match history. */
  async matchHistory(limit?: number, offset?: number): Promise<{ matches: MatchView[] }> {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));
    const qs = params.toString();
    return this.rest.get(`/v1/matches/history${qs ? `?${qs}` : ""}`);
  }

  /**
   * Report a 1v1 match result. Signs the report with EIP-191 if a signer
   * is available (required for staked matches).
   */
  async reportMatch(
    matchId: string,
    result: "win" | "loss" | "draw",
    transcriptHash?: string,
  ): Promise<{ matchId: string; state: string }> {
    let signature: string | undefined;

    if (this.signer) {
      const message = buildReportMessage(matchId, result);
      signature = await this.signer.signPersonalSign(message);
    } else if (this.custodial && this.playerId) {
      const message = buildReportMessage(matchId, result);
      signature = await this.custodial.signPersonalSign(this.playerId, message);
    }

    return this.rest.post(`/v1/matches/${matchId}/report`, {
      result,
      transcriptHash,
      signature,
    });
  }

  // ── Parties ─────────────────────────────────────────

  /** Create a party (returns an invite code). */
  async createParty(gameId: string, rulesetId: string): Promise<{
    partyId: string;
    inviteCode: string;
    leader: string;
  }> {
    return this.rest.post("/v1/parties", {
      game_id: gameId,
      ruleset_id: rulesetId,
    });
  }

  /** Join a party by invite code. */
  async joinParty(inviteCode: string): Promise<{ partyId: string; members: number }> {
    // NOTE: party endpoints use snake_case (historical wire format) —
    // the server's JoinPartyReq has no camelCase alias.
    return this.rest.post("/v1/parties/join", { invite_code: inviteCode.toUpperCase() });
  }

  /** Get party details. */
  async getParty(partyId: string): Promise<PartyInfo> {
    return this.rest.get(`/v1/parties/${partyId}`);
  }

  /** Lock the party (leader only — ready to queue). */
  async lockParty(partyId: string): Promise<{ state: string }> {
    return this.rest.post(`/v1/parties/${partyId}/lock`);
  }

  /** Disband the party (leader only). */
  async disbandParty(partyId: string): Promise<{ disbanded: boolean }> {
    return this.rest.post(`/v1/parties/${partyId}/disband`);
  }

  // ── Multiplayer (N-player) ──────────────────────────

  /**
   * Commit to a staked FFA queue. Generates a salt internally and
   * returns it for the reveal phase.
   */
  async multiCommit(gameId: string, stakeWei: number, lobbySize: number): Promise<{
    committed: boolean;
    committedCount: number;
    ready: boolean;
    salt: string;
  }> {
    const salt = generateSalt();
    const commitHash = await computeCommitHash(this._wallet!, stakeWei, salt);
    const result = await this.rest.post<{ committed: boolean; committedCount: number; ready: boolean }>(
      "/v1/multi/commit",
      { gameId, commitHash, stakeWei, lobbySize },
    );
    return { ...result, salt };
  }

  /** Reveal your commit salt. */
  async multiReveal(gameId: string, rulesetId: string, salt: string): Promise<{
    revealed: boolean;
    revealedCount: number;
  }> {
    return this.rest.post("/v1/multi/reveal", {
      gameId,
      rulesetId,
      salt,
    });
  }

  /** Get a multiplayer match. */
  async getMultiMatch(matchId: string): Promise<MultiMatch> {
    return this.rest.get(`/v1/multi/${matchId}`);
  }

  /**
   * Report a multiplayer ladder. Signs EIP-712 typed data if a signer
   * is available (required for staked N-player matches).
   */
  async multiReport(
    matchId: string,
    ranked: [string, number][],
    transcriptHash: string,
    sessionNonce: number,
    chainId?: number,
    contractAddress?: string,
  ): Promise<{ matchId: string; state: string; concordant?: number; quorumNeeded: number }> {
    let signature: string | undefined;

    if (this.signer || this.custodial) {
      const typedData = buildLadderTypedData({
        chainId: chainId ?? 43113,
        contractAddress: contractAddress ?? "0x3BBb1812Ccafc4a8c849BfA340174a271e43B7D1",
        matchId,
        gameId: "0x" + "0".repeat(63) + "1",
        rankedPlacements: ranked.map(([addr]) => addr),
        transcriptHash,
        sessionNonce,
      });

      signature = this.signer
        ? await this.signer.signTypedData(typedData)
        : await this.custodial!.signTypedData(this.playerId!, typedData);
    }

    return this.rest.post(`/v1/multi/${matchId}/report`, {
      ranked,
      transcriptHash,
      sessionNonce,
      signature,
    });
  }

  /** Trigger settlement for a quorum-reached multiplayer match. */
  async multiClaim(matchId: string): Promise<{ matchId: string; state: string }> {
    return this.rest.post(`/v1/multi/${matchId}/claim`);
  }

  // ── Exit certificates (multiplayer death certs) ─────

  /**
   * Submit an exit certificate ("death cert"): an eliminated player
   * signs their rank, exit frame, and state hash, then disconnects.
   * Auto-signs EIP-191 when a signer/custodial provider is present.
   */
  async submitExitCert(
    matchId: string,
    rank: number,
    exitFrame: number,
    stateHash: string,
  ): Promise<{ matchId: string; recorded: boolean; message: string }> {
    const message = buildExitCertMessage(matchId, rank, exitFrame, stateHash);
    const signature = this.signer
      ? await this.signer.signPersonalSign(message)
      : this.custodial && this.playerId
        ? await this.custodial.signPersonalSign(this.playerId, message)
        : undefined;

    return this.rest.post(`/v1/multi/${matchId}/exit`, {
      rank,
      exitFrame,
      stateHash,
      signature,
    });
  }

  /**
   * Countersign another player's exit certificate as a survivor,
   * verifying their state hash against your own simulation.
   */
  async countersignExitCert(
    matchId: string,
    wallet: string,
    stateHash: string,
  ): Promise<{ matchId: string; countersigned: boolean }> {
    return this.rest.post(`/v1/multi/${matchId}/exit/${wallet}`, { stateHash });
  }

  // ── Staked 1v1 escrow ───────────────────────────────

  /**
   * Verify on-chain escrow for a staked 1v1 match (participant only).
   * Flips an escrow_pending match to live once both deposits check out.
   */
  async verifyEscrow(matchId: string): Promise<{ matchId: string; state: string }> {
    return this.rest.post(`/v1/matches/${matchId}/escrow/verify`);
  }

  // ── Convenience ─────────────────────────────────────

  /**
   * Wait for a match assignment after joining a queue.
   * Listens on the WebSocket (with a REST polling fallback) and resolves
   * as soon as `match_found` fires. Rejects on timeout.
   *
   * @example
   * ```typescript
   * await amp.joinQueue("amp-tactics", "ranked-1v1");
   * const match = await amp.waitForMatch(30_000);
   * ```
   */
  async waitForMatch(timeoutMs = 30_000): Promise<MatchFound> {
    return new Promise<MatchFound>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`waitForMatch timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const onFound = (data: MatchFound) => {
        cleanup();
        resolve(data);
      };

      // REST fallback in case the WebSocket is unavailable
      const checkOnce = async () => {
        if (settled) return;
        try {
          const me = await this.me();
          if (me.liveMatchId) {
            const m = await this.getMatch(me.liveMatchId);
            cleanup();
            resolve({
              matchId: m.matchId,
              gameId: m.gameId,
              rulesetId: m.rulesetId,
              bot: m.bot,
              opponent: {
                wallet: m.opponent.wallet,
                rating: Number(m.opponent.ratingSnapshot ?? 1500),
                region: "na",
              },
              yourRating: Number(m.you.ratingSnapshot ?? 1500),
              expiresAt: m.expiresAt,
            });
          }
        } catch {
          /* keep polling */
        }
      };

      const poller = setInterval(checkOnce, 2_000);

      const cleanup = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(poller);
        this.off("match_found", onFound);
      };

      this.on("match_found", onFound);
      void checkOnce(); // check immediately, don't wait 2s
    });
  }

  // ── Events (WebSocket) ──────────────────────────────

  /**
   * Subscribe to a WebSocket event. Returns an unsubscribe function.
   * Connects automatically on first subscription.
   *
   * @example
   * ```typescript
   * const unsub = amp.events.on("match_found", (data) => {
   *   console.log("Matched!", data.opponent.wallet);
   * });
   * ```
   */
  on<K extends WsEventType>(
    event: K,
    handler: (data: WsEventMap[K]) => void,
  ): () => void {
    if (!this.ws) {
      const token = this.rest.getToken();
      if (!token) {
        throw new Error("Must call login() before subscribing to events");
      }
      const baseUrl = (this.rest as unknown as { baseUrl: string }).baseUrl;
      this.ws = new AMPWebSocket(baseUrl, token);
      this.ws.connect();
    }
    return this.ws.on(event, handler);
  }

  /** Unsubscribe from a WebSocket event. */
  off<K extends WsEventType>(
    event: K,
    handler: (data: WsEventMap[K]) => void,
  ): void {
    this.ws?.off(event, handler);
  }

  /** Disconnect the WebSocket. */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
