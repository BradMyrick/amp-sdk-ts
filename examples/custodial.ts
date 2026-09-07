/**
 * Custodial / Fiat-Friendly Integration
 *
 * For games where players don't have crypto wallets.
 * The game studio implements AMPCustodialProvider to handle
 * PayPal ↔ AVAX conversion. AMP handles the smart contract rails.
 *
 * Legal: AMP = protocol infrastructure (like Stripe rails).
 * The game studio is the custodial bridge, not AMP.
 */

import { AMPClient } from "../src/index.js";
import type { AMPCustodialProvider } from "../src/index.js";

// ── Implement the custodial provider ─────────────────────────────
//
// This is your game's backend — you handle fiat↔crypto.

const provider: AMPCustodialProvider = {
  // Get/create a delegated wallet for this player
  async getAddress(playerId) {
    return `0x${playerId.replace(/[^0-9a-f]/gi, "").padEnd(40, "0").slice(0, 40)}`;
  },

  // Sign EIP-191 on behalf of the player
  async signPersonalSign(playerId, message) {
    // Use your custodial key infrastructure
    const wallet = await getWalletFor(playerId);
    return wallet.signMessage(message);
  },

  // Sign EIP-712 on behalf of the player
  async signTypedData(playerId, typedData) {
    const wallet = await getWalletFor(playerId);
    return wallet.signTypedData(typedData.domain, typedData.types, typedData.message);
  },

  // Fund a staked match (convert PayPal → AVAX, deposit to escrow)
  async fundMatch(matchId, playerId) {
    const payment = await getPayment(playerId);
    if (!payment?.completed) throw new Error("Payment required");
    const avax = await convertUsdToAvax(payment.amount);
    await depositToEscrow(matchId, avax, playerId);
  },

  // Withdraw winnings (claim on-chain, convert to USD, send via PayPal)
  async withdrawWinnings(matchId, playerId) {
    const payout = await claimFromEscrow(matchId, playerId);
    const usd = await convertAvaxToUsd(payout);
    await sendPayPalPayout(playerId, usd);
  },
};

// ── Use it in your game ──────────────────────────────────────────

async function startCustodialGame() {
  const amp = new AMPClient({
    serverUrl: "https://amp.playwithamp.xyz",
    custodial: provider,
    playerId: "player-123",
  });

  // Player doesn't need a wallet — your backend handles everything
  await amp.login();

  // Queue, match, report — same API as the self-custody path
  await amp.joinQueue("amp-tactics", "ranked-1v1");

  amp.events.on("match_found", async (match) => {
    const result = await runGame(match);
    await amp.reportMatch(match.matchId, result);
    // ↑ This calls provider.signPersonalSign() internally
  });

  amp.events.on("match_result", async (result) => {
    if (result.won && isStakedMatch(result)) {
      await provider.withdrawWinnings(result.matchId, "player-123");
    }
  });
}

// Placeholder functions — implement these in your backend
async function getWalletFor(id: string) {
  throw new Error("Implement: return a signing wallet for " + id);
}
async function getPayment(id: string) {
  return null;
}
async function convertUsdToAvax(usd: number) {
  return BigInt(0);
}
async function depositToEscrow(matchId: string, amount: bigint, playerId: string) {}
async function claimFromEscrow(matchId: string, playerId: string) {
  return BigInt(0);
}
async function convertAvaxToUsd(avax: bigint) {
  return 0;
}
async function sendPayPalPayout(playerId: string, usd: number) {}
async function runGame(match: any) {
  return "win" as const;
}
function isStakedMatch(result: any) {
  return false;
}
