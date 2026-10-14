import type { TypedDataField } from "ethers";

/**
 * @amp/sdk constants — Avalanche Fuji deployment and EIP-712 definitions.
 */

/** Deployed AMPTournamentCup address on Avalanche Fuji testnet */
export const DEFAULT_CUP_ADDRESS = "0x7C743c1C9AE3e7A65d030098F2249B7787d66dfF";

/** Avalanche Fuji C-Chain ID */
export const DEFAULT_FUJI_CHAIN_ID = 43113;

/** Public Avalanche Fuji RPC endpoint */
export const DEFAULT_FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";

/** Snowtrace Fuji Block Explorer base URL */
export const DEFAULT_EXPLORER_URL = "https://testnet.snowtrace.io";

/** EIP-712 Domain Name */
export const EIP712_DOMAIN_NAME = "AMPTournamentCup";

/** EIP-712 Domain Version */
export const EIP712_DOMAIN_VERSION = "1";

/** EIP-712 Type Definitions for Tournament Finalization */
export const TOURNAMENT_RESULT_TYPES: Record<string, TypedDataField[]> = {
  TournamentResult: [
    { name: "tournamentId", type: "uint256" },
    { name: "winners", type: "address[]" },
  ],
};

/**
 * Standard payout split presets (basis points, sum = 10000).
 */
export const PAYOUT_PRESETS: Record<string, { label: string; bps: number[] }> = {
  winnerTakesAll: { label: "Winner takes all", bps: [10000] },
  top2: { label: "Top 2 (70 / 30)", bps: [7000, 3000] },
  top3: { label: "Top 3 (60 / 30 / 10)", bps: [6000, 3000, 1000] },
  top4: { label: "Top 4 (50 / 25 / 15 / 10)", bps: [5000, 2500, 1500, 1000] },
  top8: {
    label: "Top 8 (40 / 20 / 12 / 8 / 5 / 5 / 5 / 5)",
    bps: [4000, 2000, 1200, 800, 500, 500, 500, 500],
  },
};

/**
 * On-chain tournament lifecycle state enum (mirrors AMPTournamentCup.sol).
 */
export enum CupState {
  OPEN = 0, // Funded, awaiting verifier finalization
  FINALIZED = 1, // Winners attested; claims open
  COMPLETE = 2, // All winners have claimed
  CANCELLED = 3, // Sponsor refunded
}

/** Human-readable ABI for AMPTournamentCup */
export const AMP_TOURNAMENT_CUP_ABI = [
  "constructor(address _feeRecipient)",
  "function MAX_PLACEMENTS() view returns (uint8)",
  "function MAX_PROTOCOL_FEE_BPS() view returns (uint16)",
  "function TOURNAMENT_RESULT_TYPEHASH() view returns (bytes32)",
  "function nextTournamentId() view returns (uint256)",
  "function protocolFeeBps() view returns (uint16)",
  "function protocolFeeRecipient() view returns (address)",
  "function domainSeparator() view returns (bytes32)",
  "function claimed(uint256 tournamentId, uint256 placement) view returns (bool)",
  "function getTournament(uint256 id) view returns (tuple(address sponsor, address token, uint256 prizePool, uint16[] payoutBps, address verifier, address[] winners, uint8 state, uint64 createdAt, uint64 finalizeDeadline))",
  "function createTournament(uint16[] payoutBps, address verifier, uint64 finalizeDeadline) payable returns (uint256 tournamentId)",
  "function createTournamentERC20(address token, uint256 amount, uint16[] payoutBps, address verifier, uint64 finalizeDeadline) returns (uint256 tournamentId)",
  "function finalizeTournament(uint256 tournamentId, address[] winners, bytes signature)",
  "function claimPrize(uint256 tournamentId, uint256 placement)",
  "function cancelTournament(uint256 tournamentId)",
  "function pause()",
  "function unpause()",
  "function updateProtocolFeeBps(uint16 feeBps)",
  "function updateProtocolFeeRecipient(address recipient)",
  "event TournamentCreated(uint256 indexed tournamentId, address indexed sponsor, address token, uint256 prizePool, address verifier)",
  "event TournamentFinalized(uint256 indexed tournamentId, bytes32 indexed winnersRoot)",
  "event PrizeClaimed(uint256 indexed tournamentId, uint256 indexed placement, address winner, uint256 amount)",
  "event TournamentCancelled(uint256 indexed tournamentId, uint256 refund)",
  "event ProtocolFeeUpdated(uint16 feeBps)",
  "event ProtocolFeeRecipientUpdated(address indexed recipient)",
] as const;
