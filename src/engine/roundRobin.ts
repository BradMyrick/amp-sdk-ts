// Round-robin via the circle method — mirrors amp-tournament/src/round_robin.rs
import { BracketMatch, Entrant, MatchId } from "./types.js";

export function buildRoundRobin<I>(
  entrants: Entrant<I>[],
  startId: MatchId
): { matches: BracketMatch<I>[]; rounds: number } {
  const n = entrants.length;
  const paddedLen = n % 2 === 0 ? n : n + 1;
  const positions: (Entrant<I> | null)[] = entrants.map((e) => ({ ...e }));
  while (positions.length < paddedLen) positions.push(null);

  const rounds = paddedLen - 1;
  const half = Math.floor(paddedLen / 2);
  const matches: BracketMatch<I>[] = [];
  let nextId = startId;

  for (let round = 0; round < rounds; round++) {
    let slot = 0;
    for (let i = 0; i < half; i++) {
      const j = paddedLen - 1 - i;
      const a = positions[i] ? { ...positions[i]! } : null;
      const b = positions[j] ? { ...positions[j]! } : null;
      // Skip byes entirely (entrant vs dummy).
      if (!a || !b) continue;
      matches.push({
        id: nextId++,
        round,
        slot: slot++,
        a,
        b,
        outcome: null,
        winnerTo: null,
      });
    }
    // Rotate: keep position 0 fixed, rotate the rest clockwise.
    const last = positions.pop() ?? null;
    positions.splice(1, 0, last);
  }

  return { matches, rounds };
}
