// Swiss pairing — mirrors amp-tournament/src/swiss.rs
import { Entrant, MatchId } from "./types.js";

export class SwissEntry<I> {
  entrant: Entrant<I>;
  wins = 0;
  draws = 0;
  losses = 0;
  played = new Set<I>();

  constructor(entrant: Entrant<I>) {
    this.entrant = entrant;
  }

  score(): number {
    return this.wins + 0.5 * this.draws;
  }
}

/** Deterministic Swiss pairing for one round. */
export function pairSwissRound<I>(
  entries: SwissEntry<I>[],
  startId: MatchId
): { id: MatchId; a: Entrant<I>; b: Entrant<I> }[] {
  const idx = entries.map((_, i) => i);
  // Order: score desc, seed asc, id-as-number asc.
  idx.sort((a, b) => {
    const sa = entries[a].score();
    const sb = entries[b].score();
    if (sb !== sa) return sb - sa;
    if (entries[a].entrant.seed !== entries[b].entrant.seed) {
      return entries[a].entrant.seed - entries[b].entrant.seed;
    }
    return Number(entries[a].entrant.id) - Number(entries[b].entrant.id);
  });

  const paired = new Array(entries.length).fill(false);
  const out: { id: MatchId; a: Entrant<I>; b: Entrant<I> }[] = [];
  let nextId = startId;

  for (const i of idx) {
    if (paired[i]) continue;
    let chosen: number | null = null;
    for (const j of idx) {
      if (j === i || paired[j]) continue;
      if (entries[i].played.has(entries[j].entrant.id)) continue;
      chosen = j;
      break;
    }
    if (chosen !== null) {
      const j = chosen;
      paired[i] = true;
      paired[j] = true;
      const a = { ...entries[i].entrant };
      const b = { ...entries[j].entrant };
      entries[i].played.add(b.id);
      entries[j].played.add(a.id);
      out.push({ id: nextId++, a, b });
    }
  }

  return out;
}
