// Tournament driver — mirrors amp-tournament/src/tournament.rs
import { buildRoundRobin } from "./roundRobin.js";
import { buildSingleElim } from "./singleElim.js";
import { pairSwissRound, SwissEntry } from "./swiss.js";
import {
  BracketMatch,
  Entrant,
  MatchId,
  Outcome,
  Side,
  Standing,
  TournamentError,
  TournamentFormat,
  TournamentState,
  isReady,
  matchSide,
} from "./types.js";

export class Tournament<I = number> {
  format: TournamentFormat;
  private entrants: Entrant<I>[];
  private matchMap = new Map<MatchId, BracketMatch<I>>();
  private nextId: MatchId = 1;
  private complete = false;
  private swissEntries: SwissEntry<I>[] | null = null;
  private swissRound = 0;

  private constructor(format: TournamentFormat, entrants: Entrant<I>[]) {
    this.format = format;
    this.entrants = entrants;
  }

  static new<I>(format: TournamentFormat, entrants: Entrant<I>[]): Tournament<I> {
    if (entrants.length < 2) throw new TournamentError("TooFewEntrants", "needs >= 2 entrants");
    if (!Tournament.idsUnique(entrants)) throw new TournamentError("DuplicateEntrant", "duplicate id");
    if (format.kind === TournamentState.Swiss && format.rounds === 0) {
      throw new TournamentError("InvalidSwissRounds", "swiss rounds >= 1");
    }
    const t = new Tournament(format, entrants.slice());
    switch (format.kind) {
      case TournamentState.SingleElimination: {
        const { matches } = buildSingleElim(entrants, t.nextId);
        t.nextId += matches.length;
        for (const m of matches) t.matchMap.set(m.id, m);
        t.advanceSingleElim();
        break;
      }
      case TournamentState.RoundRobin: {
        const { matches } = buildRoundRobin(entrants, t.nextId);
        t.nextId += matches.length;
        for (const m of matches) t.matchMap.set(m.id, m);
        break;
      }
      case TournamentState.Swiss: {
        t.swissEntries = entrants.map((e) => new SwissEntry({ ...e }));
        t.swissRound = 0;
        t.pairSwissRound();
        break;
      }
    }
    t.recomputeComplete();
    return t;
  }

  private static idsUnique<I>(entrants: Entrant<I>[]): boolean {
    const seen = new Set<I>();
    for (const e of entrants) {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
    }
    return true;
  }

  // ── accessors ──

  entrantsList(): Entrant<I>[] {
    return this.entrants;
  }

  /** All matches, ordered by id ascending (matches Rust's BTreeMap iteration). */
  matches(): BracketMatch<I>[] {
    return [...this.matchMap.values()].sort((a, b) => a.id - b.id);
  }

  /** Ready-to-play match ids, id-ordered. */
  pending(): MatchId[] {
    return this.matches()
      .filter(isReady)
      .map((m) => m.id);
  }

  isComplete(): boolean {
    return this.complete;
  }

  champion(): I | null {
    const finalMatch = this.matches().find((m) => m.winnerTo === null && m.outcome !== null);
    if (!finalMatch || finalMatch.outcome === null) return null;
    const w = outcomeWinner(finalMatch.outcome);
    if (!w) return null;
    const winner = matchSide(finalMatch, w);
    return winner ? winner.id : null;
  }

  // ── record + advance ──

  record(id: MatchId, outcome: Outcome): void {
    const isSingleElim = this.format.kind === TournamentState.SingleElimination;
    const m = this.matchMap.get(id);
    if (!m) throw new TournamentError("UnknownMatch", `match ${id} not found`);
    if (!isReady(m)) throw new TournamentError("NotRecordable", `match ${id} not ready`);
    if (isSingleElim && outcome === Outcome.Draw) {
      throw new TournamentError("DrawNotAllowed", `single-elim match ${id} can't draw`);
    }
    m.outcome = outcome;
    this.advance();
  }

  advance(): void {
    switch (this.format.kind) {
      case TournamentState.SingleElimination:
        this.advanceSingleElim();
        break;
      case TournamentState.RoundRobin:
        break;
      case TournamentState.Swiss: {
        if (this.swissRoundOpen()) return;
        this.applySwissResults();
        const maxRounds = (this.format as { rounds: number }).rounds;
        if (this.swissRound + 1 < maxRounds) {
          this.swissRound += 1;
          this.pairSwissRound();
        }
        break;
      }
    }
    this.recomputeComplete();
  }

  private advanceSingleElim(): void {
    for (;;) {
      let changed = false;

      // 1. Auto-complete round-0 byes.
      for (const m of this.matchMap.values()) {
        if (m.round === 0 && m.outcome === null) {
          if (m.a && !m.b) {
            m.outcome = Outcome.A;
            changed = true;
          } else if (!m.a && m.b) {
            m.outcome = Outcome.B;
            changed = true;
          }
        }
      }

      // 2. Propagate winners into their target slots.
      const updates: { tgt: MatchId; side: Side; winner: Entrant<I> }[] = [];
      for (const m of this.matchMap.values()) {
        if (m.outcome === null || !m.winnerTo) continue;
        const winnerSide = outcomeWinner(m.outcome);
        if (!winnerSide) continue;
        const winner = matchSide(m, winnerSide);
        if (!winner) continue;
        const target = this.matchMap.get(m.winnerTo.matchId);
        if (!target) continue;
        const occupied = m.winnerTo.side === Side.A ? target.a !== null : target.b !== null;
        if (!occupied) updates.push({ tgt: m.winnerTo.matchId, side: m.winnerTo.side, winner });
      }
      for (const { tgt, side, winner } of updates) {
        const target = this.matchMap.get(tgt)!;
        if (side === Side.A) target.a = winner;
        else target.b = winner;
        changed = true;
      }

      if (!changed) break;
    }
  }

  private pairSwissRound(): void {
    if (!this.swissEntries) return;
    const pairs = pairSwissRound(this.swissEntries, this.nextId);
    this.nextId += pairs.length;
    for (const { id, a, b } of pairs) {
      this.matchMap.set(id, {
        id,
        round: this.swissRound,
        slot: 0,
        a,
        b,
        outcome: null,
        winnerTo: null,
      });
    }
  }

  private swissRoundOpen(): boolean {
    for (const m of this.matchMap.values()) {
      if (m.round === this.swissRound && m.outcome === null && isReady(m)) return true;
    }
    return false;
  }

  private applySwissResults(): void {
    if (!this.swissEntries) return;
    const idToIdx = new Map<I, number>();
    this.swissEntries.forEach((e, i) => idToIdx.set(e.entrant.id, i));
    for (const m of this.matchMap.values()) {
      if (m.round !== this.swissRound || m.outcome === null) continue;
      const a = m.a, b = m.b;
      if (!a || !b) continue;
      const ia = idToIdx.get(a.id);
      const ib = idToIdx.get(b.id);
      if (ia === undefined || ib === undefined) continue;
      const entries = this.swissEntries!;
      switch (m.outcome) {
        case Outcome.A:
          entries[ia].wins++;
          entries[ib].losses++;
          break;
        case Outcome.B:
          entries[ib].wins++;
          entries[ia].losses++;
          break;
        case Outcome.Draw:
          entries[ia].draws++;
          entries[ib].draws++;
          break;
        case Outcome.Void:
          break;
      }
    }
  }

  private recomputeComplete(): void {
    this.complete =
      this.format.kind === TournamentState.SingleElimination
        ? this.matches().some((m) => m.winnerTo === null && m.outcome !== null)
        : this.format.kind === TournamentState.RoundRobin
        ? this.matchMap.size > 0 && this.matches().every((m) => m.outcome !== null)
        : (() => {
            const rounds = (this.format as { rounds: number }).rounds;
            const all = this.matches();
            const total = all.filter((m) => !((m.a && !m.b) || (!m.a && m.b))).length;
            const decided = all.filter((m) => m.outcome !== null).length;
            return rounds === this.swissRound + 1 && total > 0 && total === decided;
          })();
  }

  // ── standings + winners ──

  standings(): Standing<I>[] {
    const st = new Map<I, Standing<I>>();
    for (const e of this.entrants) st.set(e.id, { id: e.id, place: null, wins: 0, draws: 0, losses: 0 });
    for (const m of this.matchMap.values()) {
      if (m.outcome === null) continue;
      const a = m.a, b = m.b;
      if (!a || !b) continue;
      switch (m.outcome) {
        case Outcome.A:
          st.get(a.id)!.wins++;
          st.get(b.id)!.losses++;
          break;
        case Outcome.B:
          st.get(b.id)!.wins++;
          st.get(a.id)!.losses++;
          break;
        case Outcome.Draw:
          st.get(a.id)!.draws++;
          st.get(b.id)!.draws++;
          break;
        case Outcome.Void:
          break;
      }
    }
    return [...st.values()].sort(
      (a, b) => b.wins - a.wins || a.losses - b.losses || Number(a.id) - Number(b.id)
    );
  }

  winners(): I[] {
    return this.format.kind === TournamentState.SingleElimination
      ? this.singleElimOrder()
      : this.standings().map((s) => s.id);
  }

  private singleElimOrder(): I[] {
    const elimRound = new Map<I, number | null>();
    const seedOf = new Map<I, number>();
    for (const e of this.entrants) {
      elimRound.set(e.id, null);
      seedOf.set(e.id, e.seed);
    }
    for (const m of this.matchMap.values()) {
      if (m.outcome === null) continue;
      const loserSide = loserSideOf(m.outcome);
      if (!loserSide) continue;
      const loser = matchSide(m, loserSide);
      if (!loser) continue;
      elimRound.set(loser.id, m.round);
    }
    const champ = this.champion();
    const ordered: I[] = [];
    if (champ !== null) ordered.push(champ);
    const rest: I[] = [...elimRound.entries()]
      .filter(([id]) => id !== champ)
      .map(([id]) => id);
    rest.sort((a, b) => {
      const ea = elimRound.get(a) ?? 0;
      const eb = elimRound.get(b) ?? 0;
      if (eb !== ea) return eb - ea;
      return (seedOf.get(a) ?? 1e9) - (seedOf.get(b) ?? 1e9);
    });
    ordered.push(...rest);
    return ordered;
  }
}

function outcomeWinner(o: Outcome): Side | null {
  switch (o) {
    case Outcome.A:
      return Side.A;
    case Outcome.B:
      return Side.B;
    default:
      return null;
  }
}

function loserSideOf(o: Outcome): Side | null {
  switch (o) {
    case Outcome.A:
      return Side.B;
    case Outcome.B:
      return Side.A;
    default:
      return null;
  }
}

export type { TournamentFormat };
