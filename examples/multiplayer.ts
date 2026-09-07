/**
 * N-Player Multiplayer (FFA lobbies, 4-64 players)
 *
 * Uses commit-reveal anti-collusion: identities are hidden during
 * the commit phase, then revealed and shuffled with an Avalanche
 * blockhash. Coordinated groups can't reliably land together.
 *
 * Flow: commit → reveal → lobby → play → report ladder → settle
 */

import { AMPClient, PrivateKeySigner } from "../src/index.js";

async function multiplayerFFA() {
  const amp = new AMPClient({
    serverUrl: "https://amp.playwithamp.xyz",
    signer: new PrivateKeySigner(process.env.TEST_KEY!),
  });

  await amp.login();

  // ── COMMIT: identity hidden ─────────────────────────────
  // The SDK generates a random salt, computes keccak256(addr‖stake‖salt),
  // and submits only the hash. Returns the salt for the reveal step.
  const commit = await amp.multiCommit("amp-tactics", 0, 8); // free play, 8 players
  console.log(`Committed (${commit.committedCount}/8 in pool)`);

  // ── REVEAL: when the pool fills ─────────────────────────
  if (commit.ready) {
    const reveal = await amp.multiReveal("amp-tactics", "ranked-1v1", commit.salt);
    console.log(`Revealed (${reveal.revealedCount}/8)`);
  }

  // ── LOBBY: WebSocket push when formed ───────────────────
  amp.events.on("multi_lobby_formed", async (lobby) => {
    console.log(`\n🎮 Lobby of ${lobby.lobbySize} formed!`);

    // Get full match details with player list
    const match = await amp.getMultiMatch(lobby.matchId);
    match.players.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.wallet.slice(0, 8)}… (${Math.round(p.rating)} MMR)`);
    });

    // Run your game, then rank every player
    const rankings = await runGame(lobby.matchId);

    // Report the ladder (EIP-712 signed automatically)
    await amp.multiReport(
      lobby.matchId,
      rankings,               // [[wallet, rank], ...] — rank 1 = winner
      "0x" + "0".repeat(64), // transcriptHash (deterministic replay hash)
      lobby.sessionNonce,
      lobby.chainId,
      lobby.multiplayerAddress,
    );
  });

  // ── RESULT: rating delta when settled ───────────────────
  amp.events.on("multi_result", (result) => {
    console.log(`Settled: ${result.outcome.delta > 0 ? "+" : ""}${result.outcome.delta} MMR`);
    amp.disconnect();
    process.exit(0);
  });

  console.log("Waiting for lobby... (Ctrl+C to stop)");
  setInterval(() => {}, 1000);
}

async function runGame(matchId: string): Promise<[string, number][]> {
  // Your game logic — return rankings from 1 (winner) to N
  console.log("Playing game...");
  await new Promise((r) => setTimeout(r, 3000));
  return [["0xabc", 1], ["0xdef", 2]];
}

multiplayerFFA().catch(console.error);
