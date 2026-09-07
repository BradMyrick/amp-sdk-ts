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
import { buildReportMessage, buildLadderTypedData, computeCommitHash, generateSalt } from "../crypto/helpers.js";

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
    return this.rest.post("/v1/parties", { gameId, rulesetId });
  }

  /** Join a party by invite code. */
  async joinParty(inviteCode: string): Promise<{ partyId: string; members: number }> {
    return this.rest.post("/v1/parties/join", { inviteCode: inviteCode.toUpperCase() });
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
        contractAddress: contractAddress ?? "0xcabf7b626172fE55d54f03c346563671AbcC77f7",
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
