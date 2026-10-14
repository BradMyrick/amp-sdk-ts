// Core tournament engine types — mirrors amp-tournament/src/types.rs

export type MatchId = number;

export enum Side {
  A = "A",
  B = "B",
}

export enum Outcome {
  A = "A",
  B = "B",
  Draw = "Draw",
  Void = "Void",
}

export function outcomeWinner(o: Outcome): Side | null {
  switch (o) {
    case Outcome.A:
      return Side.A;
    case Outcome.B:
      return Side.B;
    default:
      return null;
  }
}

export interface Entrant<I = number> {
  id: I;
  seed: number;
}

export function entrantSeedCmp<I>(a: Entrant<I>, b: Entrant<I>): number {
  if (a.seed !== b.seed) return a.seed - b.seed;
  return 0;
}

export interface BracketMatch<I = number> {
  id: MatchId;
  round: number;
  slot: number;
  a: Entrant<I> | null;
  b: Entrant<I> | null;
  outcome: Outcome | null;
  winnerTo: { matchId: MatchId; side: Side } | null;
}

export function matchSide<I>(m: BracketMatch<I>, s: Side): Entrant<I> | null {
  return s === Side.A ? m.a : m.b;
}

export function matchWinner<I>(m: BracketMatch<I>): Entrant<I> | null {
  if (!m.outcome) return null;
  const w = outcomeWinner(m.outcome);
  return w ? matchSide(m, w) : null;
}

export function isBye<I>(m: BracketMatch<I>): boolean {
  return (m.a !== null && m.b === null) || (m.a === null && m.b !== null);
}

export function isReady<I>(m: BracketMatch<I>): boolean {
  return m.outcome === null && m.a !== null && m.b !== null;
}

export interface Standing<I = number> {
  id: I;
  place: number | null;
  wins: number;
  draws: number;
  losses: number;
}

export enum TournamentState {
  SingleElimination = "single_elimination",
  RoundRobin = "round_robin",
  Swiss = "swiss",
}

export type TournamentFormat =
  | { kind: TournamentState.SingleElimination }
  | { kind: TournamentState.RoundRobin }
  | { kind: TournamentState.Swiss; rounds: number };

export class TournamentError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "TournamentError";
  }
}
