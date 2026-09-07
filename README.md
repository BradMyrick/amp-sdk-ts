# @amp/sdk

**The Avalanche Matchmaking Protocol SDK for TypeScript.**

Add ranked matchmaking, skill ratings, and on-chain settlement to your game in minutes.

## Install

```bash
npm install @amp/sdk
```

Optional peer dependency for wallet signing:

```bash
npm install ethers
```

## Quickstart

### Web game (browser wallet)

```typescript
import { AMPClient, InjectedWalletSigner } from "@amp/sdk";

const amp = new AMPClient({
  serverUrl: "https://amp.playwithamp.xyz",
  signer: new InjectedWalletSigner(),
});

// One gasless signature to log in
await amp.login();

// Join a ranked queue
await amp.joinQueue("amp-tactics", "ranked-1v1");

// Listen for match assignments
amp.events.on("match_found", async (match) => {
  console.log(`Matched with ${match.opponent.wallet} (${match.opponent.rating} MMR)`);

  // Run your game, then report
  const result = await playMyGame(match);
  await amp.reportMatch(match.matchId, result);
});

// Listen for results (rating updates)
amp.events.on("match_result", (result) => {
  console.log(`${result.won ? "Won" : "Lost"} — rating: ${result.you.ratingBefore} → ${result.you.ratingAfter}`);
});
```

### Server-side game (private key)

```typescript
import { AMPClient, PrivateKeySigner } from "@amp/sdk";

const amp = new AMPClient({
  serverUrl: "https://amp.playwithamp.xyz",
  signer: new PrivateKeySigner(process.env.GAME_WALLET_KEY!),
});

await amp.login();
```

### Custodial (fiat-friendly, no crypto required)

```typescript
import { AMPClient } from "@amp/sdk";

const amp = new AMPClient({
  serverUrl: "https://amp.playwithamp.xyz",
  custodial: {
    getAddress: async (playerId) => myBackend.getWallet(playerId),
    signPersonalSign: async (playerId, message) => myBackend.sign(playerId, message),
    signTypedData: async (playerId, td) => myBackend.signTypedData(playerId, td),
    fundMatch: async (matchId, playerId) => myBackend.fund(matchId, playerId),
    withdrawWinnings: async (matchId, playerId) => myBackend.withdraw(matchId, playerId),
  },
  playerId: currentPlayer.id,
});

await amp.login();
```

## API Reference

### `AMPClient`

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
| `on(event, handler)` | Subscribe to WebSocket event |
| `disconnect()` | Close WebSocket |

### WebSocket Events

| Event | Payload |
|---|---|
| `hello` | `{ wallet }` |
| `queue_status` | `{ depth, waitedMs, skillWindow }` |
| `match_found` | `{ matchId, opponent, yourRating, expiresAt }` |
| `match_result` | `{ matchId, won, you: { ratingBefore, ratingAfter } }` |
| `multi_lobby_formed` | `{ matchId, lobbySize, stakeWei, sessionNonce }` |
| `multi_result` | `{ matchId, outcome: { delta } }` |
| `multi_cancelled` | `{ matchId, reason }` |

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

## License

Apache-2.0
