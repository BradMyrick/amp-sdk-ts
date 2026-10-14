// Single-elimination bracket construction — mirrors amp-tournament/src/single_elim.rs
import { nextPow2, seedSlots } from "./seeding.js";
import { BracketMatch, Entrant, MatchId, Side } from "./types.js";

export function buildSingleElim<I>(
  entrants: Entrant<I>[],
  startId: MatchId
): { matches: BracketMatch<I>[]; rounds: number } {
  const n = entrants.length;
  const bracket = nextPow2(Math.max(n, 2));
  const rounds = Math.log2(bracket);

  // Seed order: seed asc.
  const ordered = [...entrants].sort((a, b) => a.seed - b.seed);

  // rank -> slot
  const slots = seedSlots(bracket);

  // slot -> entrant
  const slotEntrant: (Entrant<I> | null)[] = new Array(bracket).fill(null);
  slots.forEach((slot, rank) => {
    if (rank < ordered.length) slotEntrant[slot] = ordered[rank];
  });

  // Allocate match ids round-major (stable for winnerTo pointers).
  const ids: MatchId[][] = [];
  let nextId = startId;
  for (let r = 0; r < rounds; r++) {
    const m = bracket >> (r + 1);
    const row: MatchId[] = [];
    for (let i = 0; i < m; i++) {
      row.push(nextId++);
    }
    ids.push(row);
  }

  const matches: BracketMatch<I>[] = [];
  for (let r = 0; r < rounds; r++) {
    const mCount = bracket >> (r + 1);
    for (let mIdx = 0; mIdx < mCount; mIdx++) {
      let a: Entrant<I> | null = null;
      let b: Entrant<I> | null = null;
      if (r === 0) {
        a = slotEntrant[mIdx * 2];
        b = slotEntrant[mIdx * 2 + 1];
      }
      let winnerTo: { matchId: MatchId; side: Side } | null = null;
      if (r + 1 < rounds) {
        const next = Math.floor(mIdx / 2);
        const side = mIdx % 2 === 0 ? Side.A : Side.B;
        winnerTo = { matchId: ids[r + 1][next], side };
      }
      matches.push({
        id: ids[r][mIdx],
        round: r,
        slot: mIdx,
        a,
        b,
        outcome: null,
        winnerTo,
      });
    }
  }

  return { matches, rounds };
}
