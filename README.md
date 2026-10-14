# @amp/sdk — Avalanche Tournament & Bracket SDK

[![npm version](https://img.shields.io/npm/v/@amp/sdk.svg)](https://www.npmjs.com/package/@amp/sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Avalanche Fuji](https://img.shields.io/badge/Avalanche%20Fuji-43113-red.svg)](https://testnet.snowtrace.io/address/0x7C743c1C9AE3e7A65d030098F2249B7787d66dfF)
[![Avalanche Build Games](https://img.shields.io/badge/Avalanche-Build%20Games%20Winner-E84142.svg)](https://playwithamp.xyz)

> **Winner of the $15,000 Avalanche Build Games grant.**
>
> The official TypeScript SDK for decentralized esports tournaments on Avalanche. Manage tournament brackets offline and fund, attest, and settle prize pools directly on-chain via `AMPTournamentCup.sol` — with **zero hosted WebSocket servers required**.

---

## Highlights

- ⚡ **Direct Smart Contract Escrow**: Settle tournaments via `AMPTournamentCup.sol` deployed live on **Avalanche Fuji** (`0x7C743c1C9AE3e7A65d030098F2249B7787d66dfF`).
- 🛡️ **EIP-712 Verifier Attestation**: Cryptographic result verification. Signers attest final placements with typed data signatures before claims unlock.
- 💰 **Pull-Payment Prize Claims**: Anti-MEV pull model (`claimPrize`). Winners withdraw their exact share in AVAX or ERC-20 tokens.
- 🏆 **Zero-Dependency Bracket Engine**: Offline-capable bracket manager ported from the production AMP engine:
  - **Single Elimination**: Bit-reversal seeding, automatic round-0 bye progression, ordered podium placements.
  - **Swiss System**: Non-rematch score-paired Swiss rounds with tiebreakers.
  - **Round Robin**: Circle method scheduling ensuring every pair plays once.
- 🔌 **Universal Signers**: Works in browser extensions (Avalanche Core, MetaMask) via `InjectedWalletSigner` and in Node.js server backends via `PrivateKeySigner` or `ethers.Wallet`.

---

## Installation

```bash
npm install @amp/sdk ethers
```

---

## 1. Built-in Bracket Engine (Offline & Fast)

Run complete tournament brackets with **zero network latency** and **zero dependencies**.

```typescript
import { Tournament, TournamentState, Outcome } from "@amp/sdk";

// 1. Initialize an 8-player Single Elimination bracket
const entrants = [
  { id: "alice", seed: 1 },
  { id: "bob", seed: 2 },
  { id: "charlie", seed: 3 },
  { id: "dave", seed: 4 },
];

const tournament = Tournament.new(
  { kind: TournamentState.SingleElimination },
  entrants
);

// 2. Play matches as they become ready
while (!tournament.isComplete()) {
  const readyMatchIds = tournament.pending();

  for (const matchId of readyMatchIds) {
    const match = tournament.matches().find((m) => m.id === matchId);
    console.log(`Match ${matchId}: ${match?.a?.id} vs ${match?.b?.id}`);

    // Record winner: Outcome.A or Outcome.B
    tournament.record(matchId, Outcome.A);
  }
}

// 3. Get podium results
console.log("Champion:", tournament.champion()); // "alice"
console.log("Ordered Winners:", tournament.winners()); // ["alice", "bob", ...]
```

### Supported Formats

- **Single Elimination**: `{ kind: TournamentState.SingleElimination }`
- **Round Robin**: `{ kind: TournamentState.RoundRobin }`
- **Swiss**: `{ kind: TournamentState.Swiss, rounds: 3 }`

---

## 2. On-Chain Prize Pools with `AMPTournamentClient`

Connect directly to Avalanche Fuji to create, attest, and claim tournament prize pools.

```typescript
import { AMPTournamentClient, PAYOUT_PRESETS } from "@amp/sdk";
import { ethers } from "ethers";

// Connect with a private key (server/verifier) or injected wallet (browser)
const client = new AMPTournamentClient({
  signer: new ethers.Wallet(process.env.PRIVATE_KEY!),
});
```

### A. Create an On-Chain Tournament (Sponsor)

Fund a prize pool with native AVAX:

```typescript
const payoutBps = PAYOUT_PRESETS.top3.bps; // [6000, 3000, 1000] (60% / 30% / 10%)
const verifierAddress = "0xYourVerifierAddress...";
const deadlineUnix = Math.floor(Date.now() / 1000) + 7 * 86400; // 7 days
const prizePoolWei = ethers.parseEther("1.0"); // 1.0 AVAX

const { tournamentId, txHash } = await client.createTournament(
  payoutBps,
  verifierAddress,
  deadlineUnix,
  prizePoolWei
);

console.log(`Tournament #${tournamentId} created in tx: ${txHash}`);
```

For ERC-20 prize pools:

```typescript
const { tournamentId, txHash } = await client.createTournamentERC20(
  usdcAddress,
  ethers.parseUnits("500", 6), // 500 USDC
  PAYOUT_PRESETS.top2.bps,
  verifierAddress,
  deadlineUnix
);
```

---

### B. Query Tournament Details

```typescript
const cup = await client.getTournament(tournamentId);

console.log(`Status: ${cup.stateLabel}`); // "OPEN", "FINALIZED", or "COMPLETE"
console.log(`Prize Pool: ${cup.prizePoolFormatted} AVAX`);
console.log(`Sponsor: ${cup.sponsor}`);
console.log(`Verifier: ${cup.verifier}`);
```

---

### C. Attest Winners via EIP-712 (Verifier)

The authorized verifier signs the final standings off-chain. Anyone can submit the attested results on-chain.

```typescript
// 1. Verifier signs the winners list off-chain (gasless)
const winners = [
  "0x1111111111111111111111111111111111111111", // 1st place (60%)
  "0x2222222222222222222222222222222222222222", // 2nd place (30%)
  "0x3333333333333333333333333333333333333333", // 3rd place (10%)
];

const signature = await client.signFinalize(tournamentId, winners);

// 2. Submit attestation to Fuji C-Chain
const receipt = await client.finalizeTournament(tournamentId, winners, signature);
console.log(`Tournament finalized in block ${receipt.blockNumber}`);
```

---

### D. Pull-Claim Prizes (Winners)

Winners pull-claim their prize share:

```typescript
// Check if the connected wallet has an unclaimed prize
const claimable = await client.getClaimablePrize(tournamentId, playerAddress);

if (claimable) {
  console.log(`Place: #${claimable.placementRank}`);
  console.log(`Claimable: ${claimable.formattedAmount} AVAX`);

  // Submit on-chain claim
  const receipt = await client.claimPrize(tournamentId, claimable.placement);
  console.log(`Prize claimed in tx: ${receipt.hash}`);
}
```

---

## 3. Browser Wallet Integration (Avalanche Core / MetaMask)

In a web application, connect with `InjectedWalletSigner`:

```typescript
import { AMPTournamentClient, InjectedWalletSigner } from "@amp/sdk";

const signer = new InjectedWalletSigner();

// Auto-prompts wallet to switch to Avalanche Fuji (Chain ID 43113)
await signer.switchToFuji();

const client = new AMPTournamentClient({ signer });
const address = await client.getSignerAddress();
```

---

## Deployed Contracts

| Network | Contract | Address | Explorer |
|---|---|---|---|
| **Avalanche Fuji Testnet** | `AMPTournamentCup` | `0x7C743c1C9AE3e7A65d030098F2249B7787d66dfF` | [Snowtrace](https://testnet.snowtrace.io/address/0x7C743c1C9AE3e7A65d030098F2249B7787d66dfF) |

- **Chain ID**: `43113`
- **RPC URL**: `https://api.avax-test.network/ext/bc/C/rpc`

---

## Payout Presets

```typescript
import { PAYOUT_PRESETS } from "@amp/sdk";

PAYOUT_PRESETS.winnerTakesAll; // [10000] (100%)
PAYOUT_PRESETS.top2;           // [7000, 3000] (70% / 30%)
PAYOUT_PRESETS.top3;           // [6000, 3000, 1000] (60% / 30% / 10%)
PAYOUT_PRESETS.top4;           // [5000, 2500, 1500, 1000]
PAYOUT_PRESETS.top8;           // [4000, 2000, 1200, 800, 500, 500, 500, 500]
```

---

## API Summary

### `AMPTournamentClient`

| Method | Description |
|---|---|
| `getTournament(id)` | Fetch tournament details, prize pool, deadline, and state |
| `isPrizeClaimed(id, placement)` | Check if a placement prize has been claimed |
| `getClaimablePrize(id, address)` | Compute claimable net prize for a wallet (returns `null` if ineligible/claimed) |
| `claimPrize(id, placement)` | Pull-claim prize for a placement |
| `createTournament(bps, verifier, deadline, prizeWei)` | Fund an AVAX prize pool |
| `createTournamentERC20(token, amount, bps, verifier, deadline)` | Fund an ERC-20 prize pool |
| `signFinalize(id, winners)` | Generate EIP-712 attestation signature |
| `finalizeTournament(id, winners, sig)` | Submit verifier attestation on-chain |
| `cancelTournament(id)` | Sponsor refund (or permissionless after deadline) |
| `connect(signer)` | Clone client connected to a new signer |

### Bracket Engine (`Tournament`)

| Method | Description |
|---|---|
| `Tournament.new(format, entrants)` | Create single elim, Swiss, or round robin tournament |
| `pending()` | Get match IDs that are ready to play |
| `matches()` | Get all matches across all rounds |
| `record(matchId, outcome)` | Record match result (`Outcome.A` or `Outcome.B`) |
| `advance()` | Progress brackets and propagate byes/winners |
| `champion()` | Get champion entrant ID |
| `winners()` | Get fully ranked winner IDs |
| `standings()` | Get win/loss/draw records for all entrants |
| `isComplete()` | Check if tournament has completed |

---

## License

Apache-2.0
