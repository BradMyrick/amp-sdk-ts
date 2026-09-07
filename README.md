# @amp/sdk

**The Avalanche Matchmaking Protocol SDK for TypeScript.**

Add ranked matchmaking, skill ratings, and on-chain settlement to your game in minutes.

## Install

```bash
npm install @amp/sdk
npm install ethers  # optional peer dep for wallet signing
```

## Quickstart

```typescript
import { AMPClient, InjectedWalletSigner } from "@amp/sdk";

const amp = new AMPClient({
  serverUrl: "https://amp.playwithamp.xyz",
  signer: new InjectedWalletSigner(),
});

await amp.login();
await amp.joinQueue("amp-tactics", "ranked-1v1");

amp.events.on("match_found", async (match) => {
  const result = await playMyGame(match);
  await amp.reportMatch(match.matchId, result);
});

amp.events.on("match_result", (result) => {
  console.log(`${result.won ? "Won" : "Lost"} — ${result.you.ratingBefore} → ${result.you.ratingAfter}`);
});
```

## Examples

Three complete, runnable files in [`examples/`](examples/):

| Example | What it covers |
|---|---|
| [`quick-start.ts`](examples/quick-start.ts) | Full lifecycle: login → queue → match → report → result |
| [`multiplayer.ts`](examples/multiplayer.ts) | N-player FFA: commit-reveal, EIP-712 ladders, quorum |
| [`custodial.ts`](examples/custodial.ts) | Fiat path: PayPal ↔ AVAX, no crypto needed for players |

```bash
git clone https://github.com/BradMyrick/amp-sdk-ts.git
cd amp-sdk-ts && npm install
npx tsx examples/quick-start.ts
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Your Game (browser, Node.js, etc.)                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │  AMPClient (from @amp/sdk)                       │   │
│  │  • login() — one gasless signature               │   │
│  │  • joinQueue() — enter the ranked queue          │   │
│  │  • reportMatch() — report win/loss/draw          │   │
│  │  • events.on("match_found", ...) — real-time     │   │
│  │  Signer: InjectedWallet | PrivateKey | Custodial  │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│  REST + WebSocket → https://amp.playwithamp.xyz        │
│  (AMP matchmaker — Rust) → Avalanche Fuji (contracts)  │
└─────────────────────────────────────────────────────────┘
```

### What AMP handles vs what you handle

| AMP handles | Your game handles |
|---|---|
| Skill ratings (Glicko-2) | Determining who won |
| Matchmaking queue + skill windows | Running the actual game |
| Match assignment (WebSocket push) | Game UI/UX |
| Result verification + settlement | Player experience |
| On-chain escrow + payouts | Your game's economy |
| Anti-collusion (commit-reveal) | Your game's rules |

### Integration checklist

1. `npm install @amp/sdk ethers`
2. Create an `AMPClient` with your server URL and a signer
3. Call `amp.login()` — one free signature
4. Call `amp.joinQueue(gameId, rulesetId)`
5. Subscribe to `match_found` on the WebSocket
6. Run your game when matched
7. Call `amp.reportMatch(matchId, "win"|"loss"|"draw")`
8. Subscribe to `match_result` for rating updates

## API Reference

| Method | Description |
|---|---|
| `login()` | Gasless wallet login (one EIP-191 signature) |
| `logout()` | Clear session |
| `me()` | Get player info + ratings |
| `getPlayer(wallet)` | Get any player's public profile |
| `games()` | List available games + queue depth |
| `joinQueue(gameId, rulesetId)` | Join a ranked queue |
| `leaveQueue()` | Leave the queue |
| `queueStatus()` | Live queue status |
| `playBot()` | Skip the wait, play a bot now |
| `reportMatch(matchId, result)` | Report a 1v1 result (auto-signs) |
| `getMatch(matchId)` | Get match details |
| `matchHistory()` | Recent matches |
| `createParty(gameId, rulesetId)` | Create a party |
| `joinParty(inviteCode)` | Join by invite code |
| `lockParty(partyId)` | Lock roster, ready to queue |
| `multiCommit(gameId, stakeWei, lobbySize)` | Commit to FFA queue (returns salt) |
| `multiReveal(gameId, rulesetId, salt)` | Reveal commit |
| `multiReport(matchId, ranked, ...)` | Submit N-player ladder (auto-signs EIP-712) |
| `multiClaim(matchId)` | Trigger settlement |
| `submitExitCert(matchId, rank, exitFrame, stateHash)` | Submit a death cert on elimination (auto-signs) |
| `countersignExitCert(matchId, wallet, stateHash)` | Survivor verifies an exit cert |
| `verifyEscrow(matchId)` | Verify on-chain escrow for staked 1v1 (flips to live) |
| `waitForMatch(timeoutMs?)` | One call: queue → wait → `MatchFound` (WS + REST fallback) |
| `on(event, handler)` | Subscribe to WebSocket event |
| `disconnect()` | Close WebSocket |

### WebSocket Events

| Event | Payload | When |
|---|---|---|
| `hello` | `{ wallet }` | On connection |
| `queue_status` | `{ depth, waitedMs, skillWindow }` | Every tick while queued |
| `match_found` | `{ matchId, opponent, yourRating, expiresAt }` | Match assigned |
| `match_result` | `{ matchId, won, you: { ratingBefore, ratingAfter } }` | Match settled |
| `multi_lobby_formed` | `{ matchId, lobbySize, stakeWei, sessionNonce }` | N-player lobby ready |
| `multi_result` | `{ matchId, outcome: { delta } }` | N-player settled |
| `multi_cancelled` | `{ matchId, reason }` | N-player cancelled |
| `match_update` | `{ matchId, state }` | State change (disputed, etc.) |

### Signer Interfaces

```typescript
// Self-custody (player's wallet)
interface AMPSigner {
  getAddress(): Promise<string>;
  signPersonalSign(message: string): Promise<string>;
  signTypedData(typedData: TypedData): Promise<string>;
}

// Custodial (game studio handles fiat ↔ crypto)
interface AMPCustodialProvider {
  getAddress(playerId: string): Promise<string>;
  signPersonalSign(playerId: string, message: string): Promise<string>;
  signTypedData(playerId: string, typedData: TypedData): Promise<string>;
  fundMatch(matchId: string, playerId: string): Promise<void>;
  withdrawWinnings(matchId: string, playerId: string): Promise<void>;
}
```

## Tests

```bash
npm test                                        # 16 unit tests
npx vitest run tests/live.test.ts              # 8 live integration tests
```

## License

Apache-2.0
