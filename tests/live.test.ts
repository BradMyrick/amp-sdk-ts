import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AMPClient, PrivateKeySigner } from "../src/index.js";

const TEST_KEY = "0x" + "d" + "b".repeat(63);
const SERVER = "https://amp.playwithamp.xyz";

describe("AMP SDK — Live Integration Tests", () => {
  let amp: AMPClient;
  let wallet: string;

  beforeAll(async () => {
    amp = new AMPClient({
      serverUrl: SERVER,
      signer: new PrivateKeySigner(TEST_KEY),
    });
    const player = await amp.login();
    wallet = player.wallet;
  });

  afterAll(() => {
    amp.disconnect();
  });

  it("connects and logs in with gasless signature", () => {
    expect(wallet).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(amp.authenticated).toBe(true);
  });

  it("fetches available games", async () => {
    const { games } = await amp.games();
    expect(games.length).toBeGreaterThan(0);
    expect(games[0].rulesets.length).toBeGreaterThan(0);
  });

  it("fetches player profile", async () => {
    const me = await amp.me();
    expect(me.wallet.toLowerCase()).toBe(wallet.toLowerCase());
  });

  it("creates and disbands a party", async () => {
    const party = await amp.createParty("amp-tactics", "ranked-1v1");
    expect(party.partyId).toBeDefined();
    expect(party.inviteCode).toHaveLength(6);

    const info = await amp.getParty(party.partyId);
    expect(info.state).toBe("open");

    const result = await amp.disbandParty(party.partyId);
    expect(result.disbanded).toBe(true);
  });

  it("plays a bot match and reports the result", async () => {
    const bot = await amp.playBot();
    expect(bot.matchId).toBeDefined();
    expect(bot.bot).toBe(true);

    const match = await amp.getMatch(bot.matchId);
    expect(match.bot).toBe(true);

    const report = await amp.reportMatch(bot.matchId, "win");
    expect(report.matchId).toBe(bot.matchId);
  });

  it("joins and leaves a queue", async () => {
    // Resolve any stale live match from previous runs
    let joined = false;
    for (let attempt = 0; attempt < 3 && !joined; attempt++) {
      try {
        const result = await amp.joinQueue("amp-tactics", "ranked-1v1");
        expect(result.ticketId).toBeDefined();
        joined = true;

        const status = await amp.queueStatus();
        expect(status.queued).toBe(true);

        const left = await amp.leaveQueue();
        expect(left.left).toBe(true);
      } catch (err) {
        if (err instanceof Error && err.message.includes("live match")) {
          const me = await amp.me();
          if (me.liveMatchId) {
            await amp.reportMatch(me.liveMatchId, "win").catch(() => {});
            await new Promise((r) => setTimeout(r, 500));
          }
        } else {
          throw err;
        }
      }
    }
    expect(joined).toBe(true);
  });

  it("fetches match history", async () => {
    const { matches } = await amp.matchHistory(5);
    expect(Array.isArray(matches)).toBe(true);
  });

  it("gets another player's public profile", async () => {
    const profile = await amp.getPlayer(wallet);
    expect(profile.wallet.toLowerCase()).toBe(wallet.toLowerCase());
  });
});
