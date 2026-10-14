import { describe, it, expect } from "vitest";
import { AMPTournamentClient, CupState } from "../src/index.js";

describe("Live Avalanche Fuji Tournament Cup Contract Tests", () => {
  const client = new AMPTournamentClient();

  it("connects to Fuji contract and reads contract state", async () => {
    const nextId = await client.nextTournamentId();
    expect(nextId).toBeGreaterThanOrEqual(10);

    const ds = await client.domainSeparator();
    expect(ds).toBe("0xa06f97ad3d7e36a974ca10b74652528a5c2708ac10140a16de0f3080edf8ccd6");

    const feeBps = await client.protocolFeeBps();
    expect(feeBps).toBe(200); // 2.00%
  }, 10_000);

  it("fetches Tournament 1 (Completed Cup)", async () => {
    const t = await client.getTournament(1);
    expect(t.id).toBe(1n);
    expect(t.sponsor).toBe("0x95CC495dF579981d3Ffa4a8f77B93A17563E077a");
    expect(t.prizePoolFormatted).toBe("0.05");
    expect(t.isNativeAvax).toBe(true);
    expect(t.payoutBps).toEqual([7000, 3000]);
    expect(t.state).toBe(CupState.COMPLETE);
    expect(t.stateLabel).toBe("COMPLETE");
    expect(t.isComplete).toBe(true);

    expect(await client.isPrizeClaimed(1, 0)).toBe(true);
    expect(await client.isPrizeClaimed(1, 1)).toBe(true);
  }, 10_000);

  it("fetches Tournament 8 (Finalized Cup with Unclaimed Prizes)", async () => {
    const t = await client.getTournament(8);
    expect(t.id).toBe(8n);
    expect(t.prizePoolFormatted).toBe("1.0");
    expect(t.payoutBps).toEqual([6000, 3000, 1000]);
    expect(t.state).toBe(CupState.FINALIZED);
    expect(t.stateLabel).toBe("FINALIZED");
    expect(t.winners.length).toBe(3);

    const winner0 = t.winners[0];
    const isClaimed = await client.isPrizeClaimed(8, 0);
    expect(isClaimed).toBe(false);

    // 1st place is 60% of 1.0 AVAX = 0.6 AVAX.
    // 200 bps (2%) fee on 0.6 AVAX = 0.012 AVAX.
    // Net prize = 0.588 AVAX.
    const claimable = await client.getClaimablePrize(8, winner0);
    expect(claimable).not.toBeNull();
    expect(claimable?.placement).toBe(0);
    expect(claimable?.placementRank).toBe(1);
    expect(claimable?.formattedAmount).toBe("0.588");
    expect(claimable?.isClaimed).toBe(false);
  }, 10_000);
});
