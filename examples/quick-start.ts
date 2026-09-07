/**
 * AMP SDK Quick Start — Complete Integration in One File
 *
 * This example shows the full lifecycle: login → queue → match → report → result.
 * Copy the parts you need into your game.
 *
 * Run: npx tsx examples/quick-start.ts
 */

import { AMPClient, InjectedWalletSigner, PrivateKeySigner } from "../src/index.js";

const SERVER_URL = "https://amp.playwithamp.xyz";
const GAME_ID = "amp-tactics";
const RULESET_ID = "ranked-1v1";

// ═══════════════════════════════════════════════════════════════
// OPTION A: Browser game (MetaMask / Rabby / etc.)
// ═══════════════════════════════════════════════════════════════
//
// import { AMPClient, InjectedWalletSigner } from "@amp/sdk";
// const amp = new AMPClient({
//   serverUrl: SERVER_URL,
//   signer: new InjectedWalletSigner(),
// });

// ═══════════════════════════════════════════════════════════════
// OPTION B: Server-side game (Node.js)
// ═══════════════════════════════════════════════════════════════

async function main() {
  const amp = new AMPClient({
    serverUrl: SERVER_URL,
    signer: new PrivateKeySigner(process.env.TEST_KEY!),
  });

  // ── 1. LOGIN (one gasless signature) ────────────────────
  const player = await amp.login();
  console.log(`Logged in: ${player.wallet}`);

  // ── 2. CHECK AVAILABLE GAMES ────────────────────────────
  const { games } = await amp.games();
  console.log(`Available: ${games.map((g) => g.name).join(", ")}`);

  // ── 3. JOIN A RANKED QUEUE ──────────────────────────────
  const queueResult = await amp.joinQueue(GAME_ID, RULESET_ID);
  console.log(`Queued (depth: ${queueResult.queueDepth})`);

  // ── 4. LISTEN FOR MATCH (WebSocket) ─────────────────────
  amp.events.on("match_found", async (match) => {
    console.log(`\n⚔️  Match: vs ${match.opponent.wallet} (${match.opponent.rating})`);
    console.log(`   Your rating: ${match.yourRating}`);

    // ── 5. RUN YOUR GAME ────────────────────────────────
    // Replace with your actual game logic:
    const result = Math.random() > 0.5 ? "win" : "loss";

    // ── 6. REPORT THE RESULT (auto-signs EIP-191) ───────
    await amp.reportMatch(match.matchId, result);
    console.log(`   Reported: ${result}`);
  });

  // ── 7. LISTEN FOR RESULT (rating update) ────────────────
  amp.events.on("match_result", (result) => {
    console.log(`\n${result.won ? "🏆" : "💀"} ${Math.round(result.you.ratingBefore)} → ${Math.round(result.you.ratingAfter)}`);
    amp.disconnect();
    process.exit(0);
  });

  // ── ALTERNATIVE: Play a bot immediately ──────────────────
  // const bot = await amp.playBot();
  // console.log(`Bot match: ${bot.matchId}`);
  // const result = await runMyGame();
  // await amp.reportMatch(bot.matchId, result);

  console.log("Waiting for match... (Ctrl+C to stop)");
  setInterval(() => {}, 1000);
}

// ── What AMP handles vs what you handle ─────────────────────────
//
// AMP handles:                    Your game handles:
//   Skill ratings (Glicko-2)        Determining who won
//   Matchmaking queue               Running the game
//   Match assignment                Game UI/UX
//   Result verification             Player experience
//   On-chain escrow + payouts       Your game's economy
//   Anti-collusion (commit-reveal)  Your game's rules
//   Dispute resolution

main().catch(console.error);
