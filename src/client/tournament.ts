/**
 * AMPTournamentClient — official client for the Avalanche Tournament & Bracket SDK.
 *
 * Interacts directly with the AMPTournamentCup smart contract deployed on Avalanche Fuji
 * (0x7c743c1c9ae3e7a65d030098f2249b7787d66dff) or custom networks, without needing
 * any centralized WebSocket or backend servers.
 */

import { ethers } from "ethers";
import {
  AMP_TOURNAMENT_CUP_ABI,
  CupState,
  DEFAULT_CUP_ADDRESS,
  DEFAULT_FUJI_CHAIN_ID,
  DEFAULT_FUJI_RPC,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  TOURNAMENT_RESULT_TYPES,
} from "../constants.js";
import {
  computeFinalizeDigest,
  signFinalize as signFinalizeUtil,
  validateAndChecksumAddress,
  validateAndChecksumAddresses,
  verifyFinalizeSignature as verifyFinalizeSignatureUtil,
} from "../crypto/helpers.js";
import { PrivateKeySigner, InjectedWalletSigner } from "../signers/index.js";
import type { AMPSigner } from "../types/signer.js";

/** Options for initializing AMPTournamentClient */
export interface AMPTournamentClientOptions {
  /** RPC URL (defaults to Avalanche Fuji public RPC) */
  rpcUrl?: string;
  /** Chain ID (defaults to 43113) */
  chainId?: number;
  /** Contract address (defaults to deployed AMPTournamentCup on Fuji) */
  contractAddress?: string;
  /**
   * Signer to use for transactions and EIP-712 signing:
   * - ethers.Signer (e.g. from BrowserProvider, Wallet)
   * - InjectedWalletSigner (browser window.ethereum)
   * - PrivateKeySigner (Node.js/server key)
   * - string (raw private key, auto-wrapped in ethers.Wallet)
   */
  signer?: ethers.Signer | AMPSigner | string;
  /** Custom ethers Provider */
  provider?: ethers.Provider;
}

/** Structured details of an on-chain tournament */
export interface TournamentDetails {
  /** Tournament ID (bigint) */
  id: bigint;
  /** Tournament ID alias */
  tournamentId: bigint;
  /** Sponsor wallet address */
  sponsor: string;
  /** Prize token address (ZeroAddress for native AVAX) */
  token: string;
  /** Whether the prize pool is funded with native AVAX */
  isNativeAvax: boolean;
  /** Prize pool amount in atomic units (wei) */
  prizePool: bigint;
  /** Human-readable formatted prize pool (e.g. "1.5" AVAX) */
  prizePoolFormatted: string;
  /** Basis points per placement (index 0 = 1st place, sum = 10000) */
  payoutBps: number[];
  /** Verifier authorized to attest winners via EIP-712 */
  verifier: string;
  /** Attested winners (set once finalized) */
  winners: string[];
  /** On-chain tournament state enum (OPEN, FINALIZED, COMPLETE, CANCELLED) */
  state: CupState;
  /** State label string */
  stateLabel: "OPEN" | "FINALIZED" | "COMPLETE" | "CANCELLED";
  /** Creation timestamp (Unix seconds) */
  createdAt: number;
  /** Creation timestamp as Date */
  createdAtDate: Date;
  /** Finalization deadline timestamp (Unix seconds) */
  finalizeDeadline: number;
  /** Finalization deadline as Date */
  finalizeDeadlineDate: Date;
  /** Convenience boolean: is OPEN */
  isOpen: boolean;
  /** Convenience boolean: is FINALIZED */
  isFinalized: boolean;
  /** Convenience boolean: is COMPLETE */
  isComplete: boolean;
  /** Convenience boolean: is CANCELLED */
  isCancelled: boolean;
}

/** Information about a claimable tournament prize */
export interface ClaimableInfo {
  /** Tournament ID */
  tournamentId: bigint;
  /** 0-based placement index (0 = 1st place) */
  placement: number;
  /** 1-based rank (1 = 1st place) */
  placementRank: number;
  /** Winner wallet address */
  winnerAddress: string;
  /** Whether the prize has already been claimed */
  isClaimed: boolean;
  /** Placement basis points (e.g. 6000 = 60%) */
  payoutBps: number;
  /** Gross prize amount before protocol fee (atomic wei) */
  grossAmount: bigint;
  /** Net prize amount after protocol fee (atomic wei) */
  netAmount: bigint;
  /** Protocol fee amount deducted (atomic wei) */
  protocolFee: bigint;
  /** Net amount formatted as ether string */
  formattedAmount: string;
  /** Token address (ZeroAddress for AVAX) */
  tokenAddress: string;
  /** Whether the token is native AVAX */
  isNativeAvax: boolean;
}

export class AMPTournamentClient {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly contractAddress: string;
  readonly provider: ethers.Provider;
  readonly contract: ethers.Contract;

  private _signer?: ethers.Signer;
  private _ampsigner?: AMPSigner;

  constructor(options?: AMPTournamentClientOptions) {
    this.rpcUrl = options?.rpcUrl ?? DEFAULT_FUJI_RPC;
    this.chainId = options?.chainId ?? DEFAULT_FUJI_CHAIN_ID;
    this.contractAddress = options?.contractAddress
      ? validateAndChecksumAddress(options.contractAddress)
      : DEFAULT_CUP_ADDRESS;

    // Resolve Provider
    if (options?.provider) {
      this.provider = options.provider;
    } else if (
      options?.signer &&
      typeof options.signer === "object" &&
      "provider" in options.signer &&
      options.signer.provider
    ) {
      this.provider = options.signer.provider as ethers.Provider;
    } else {
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl, this.chainId);
    }

    // Resolve Signer
    this.setSignerInternal(options?.signer);

    const runner = this._signer ?? this.provider;
    this.contract = new ethers.Contract(
      this.contractAddress,
      AMP_TOURNAMENT_CUP_ABI,
      runner
    );
  }

  private setSignerInternal(signer?: ethers.Signer | AMPSigner | string): void {
    if (!signer) {
      this._signer = undefined;
      this._ampsigner = undefined;
      return;
    }

    if (typeof signer === "string") {
      this._signer = new ethers.Wallet(signer, this.provider);
      return;
    }

    if (signer instanceof PrivateKeySigner) {
      this._signer = signer.getWallet(this.provider);
      this._ampsigner = signer;
      return;
    }

    if (signer instanceof InjectedWalletSigner) {
      this._ampsigner = signer;
      return;
    }

    if ("signTransaction" in signer || "sendTransaction" in signer) {
      this._signer = signer as ethers.Signer;
      return;
    }

    // Generic AMPSigner
    this._ampsigner = signer as AMPSigner;
  }

  /**
   * Create a new AMPTournamentClient clone connected to the given signer.
   */
  connect(signer: ethers.Signer | AMPSigner | string): AMPTournamentClient {
    return new AMPTournamentClient({
      rpcUrl: this.rpcUrl,
      chainId: this.chainId,
      contractAddress: this.contractAddress,
      provider: this.provider,
      signer,
    });
  }

  /**
   * Resolves the active ethers.Signer asynchronously.
   */
  async getSigner(): Promise<ethers.Signer> {
    if (this._signer) return this._signer;

    if (this._ampsigner instanceof InjectedWalletSigner) {
      const s = await this._ampsigner.getEthersSigner();
      this._signer = s;
      return s;
    }

    if (this._ampsigner && "getEthersSigner" in this._ampsigner) {
      const getSignerFn = (this._ampsigner as { getEthersSigner: (p?: ethers.Provider) => Promise<ethers.Signer> | ethers.Signer }).getEthersSigner;
      const s = await getSignerFn.call(this._ampsigner, this.provider);
      this._signer = s;
      return s;
    }

    throw new Error(
      "No signer configured. Pass an ethers.Signer, InjectedWalletSigner, PrivateKeySigner, or private key string to options or use client.connect(signer)."
    );
  }

  /**
   * Returns the contract instance connected to the active signer.
   */
  private async getSignerContract(): Promise<ethers.Contract> {
    const signer = await this.getSigner();
    return this.contract.connect(signer) as ethers.Contract;
  }

  /**
   * Returns the address of the current signer.
   */
  async getSignerAddress(): Promise<string> {
    if (this._signer) return this._signer.getAddress();
    if (this._ampsigner) return this._ampsigner.getAddress();
    const s = await this.getSigner();
    return s.getAddress();
  }

  // ───────────────────────── Views ─────────────────────────

  /**
   * Fetch complete tournament details from the on-chain contract.
   *
   * @param tournamentId The cup ID to query
   */
  async getTournament(tournamentId: number | bigint): Promise<TournamentDetails> {
    const id = BigInt(tournamentId);
    const raw = await this.contract.getTournament(id);

    const sponsor = validateAndChecksumAddress(raw.sponsor);
    const token = validateAndChecksumAddress(raw.token);
    const isNativeAvax = token === ethers.ZeroAddress;
    const prizePool = BigInt(raw.prizePool);
    const payoutBps = raw.payoutBps.map((b: bigint | number) => Number(b));
    const verifier = validateAndChecksumAddress(raw.verifier);
    const winners = raw.winners.map((w: string) => validateAndChecksumAddress(w));
    const state = Number(raw.state) as CupState;
    const createdAt = Number(raw.createdAt);
    const finalizeDeadline = Number(raw.finalizeDeadline);

    const stateLabels = ["OPEN", "FINALIZED", "COMPLETE", "CANCELLED"] as const;
    const stateLabel = stateLabels[state] ?? "OPEN";

    return {
      id,
      tournamentId: id,
      sponsor,
      token,
      isNativeAvax,
      prizePool,
      prizePoolFormatted: ethers.formatEther(prizePool),
      payoutBps,
      verifier,
      winners,
      state,
      stateLabel,
      createdAt,
      createdAtDate: new Date(createdAt * 1000),
      finalizeDeadline,
      finalizeDeadlineDate: new Date(finalizeDeadline * 1000),
      isOpen: state === CupState.OPEN,
      isFinalized: state === CupState.FINALIZED,
      isComplete: state === CupState.COMPLETE,
      isCancelled: state === CupState.CANCELLED,
    };
  }

  /**
   * Check if a specific placement's prize has already been claimed.
   *
   * @param tournamentId Tournament ID
   * @param placement 0-based placement index (0 = 1st place)
   */
  async isPrizeClaimed(
    tournamentId: number | bigint,
    placement: number
  ): Promise<boolean> {
    return Boolean(await this.contract.claimed(BigInt(tournamentId), BigInt(placement)));
  }

  /**
   * Check whether a given wallet address has a claimable prize in the tournament.
   * Returns `ClaimableInfo` with gross/net prize amounts if claimable, or `null`
   * if the user is not a winner, the cup is not finalized, or the prize was already claimed.
   *
   * @param tournamentId Tournament ID
   * @param walletAddress Winner's wallet address
   * @param options.includeClaimed Set to true to return prize info even if already claimed
   */
  async getClaimablePrize(
    tournamentId: number | bigint,
    walletAddress: string,
    options?: { includeClaimed?: boolean }
  ): Promise<ClaimableInfo | null> {
    const t = await this.getTournament(tournamentId);
    const target = validateAndChecksumAddress(walletAddress);

    // Claims are only open in FINALIZED or COMPLETE states
    if (t.state !== CupState.FINALIZED && t.state !== CupState.COMPLETE) {
      return null;
    }

    const placement = t.winners.findIndex(
      (w) => w.toLowerCase() === target.toLowerCase()
    );
    if (placement === -1) {
      return null;
    }

    const isClaimed = await this.isPrizeClaimed(tournamentId, placement);
    if (isClaimed && !options?.includeClaimed) {
      return null;
    }

    let feeBps = 0n;
    try {
      const bps = await this.protocolFeeBps();
      feeBps = BigInt(bps);
    } catch {
      feeBps = 0n;
    }

    const bps = BigInt(t.payoutBps[placement] ?? 0);
    const grossAmount = (t.prizePool * bps) / 10000n;
    const protocolFee = (grossAmount * feeBps) / 10000n;
    const netAmount = grossAmount - protocolFee;

    return {
      tournamentId: t.id,
      placement,
      placementRank: placement + 1,
      winnerAddress: target,
      isClaimed,
      payoutBps: Number(bps),
      grossAmount,
      netAmount,
      protocolFee,
      formattedAmount: ethers.formatEther(netAmount),
      tokenAddress: t.token,
      isNativeAvax: t.isNativeAvax,
    };
  }

  /** Get next tournament ID that will be created */
  async nextTournamentId(): Promise<number> {
    const next = await this.contract.nextTournamentId();
    return Number(next);
  }

  /** Get current protocol fee in basis points */
  async protocolFeeBps(): Promise<number> {
    const fee = await this.contract.protocolFeeBps();
    return Number(fee);
  }

  /** Get current protocol fee recipient address */
  async protocolFeeRecipient(): Promise<string> {
    const r = await this.contract.protocolFeeRecipient();
    return validateAndChecksumAddress(r);
  }

  /** Get EIP-712 domain separator from the contract */
  async domainSeparator(): Promise<string> {
    return this.contract.domainSeparator();
  }

  // ───────────────────────── Write Transactions ─────────────────────────

  /**
   * Fund a new tournament prize pool with native AVAX.
   *
   * @param payoutBps Per-placement share in basis points (index 0 = 1st, sum must equal 10000)
   * @param verifierAddress Verifier address authorized to attest final winners
   * @param deadlineUnix Unix timestamp deadline after which an unfinalized cup may be cancelled
   * @param prizePoolAvaxWei Prize pool value to deposit (e.g. ethers.parseEther("1.0"))
   * @param overrides Optional ethers transaction overrides (gasLimit, maxFeePerGas, etc.)
   */
  async createTournament(
    payoutBps: number[],
    verifierAddress: string,
    deadlineUnix: number,
    prizePoolAvaxWei: bigint,
    overrides?: ethers.Overrides
  ): Promise<{ tournamentId: number; txHash: string }> {
    const checksummedVerifier = validateAndChecksumAddress(verifierAddress);
    const signerContract = await this.getSignerContract();

    const tx = await signerContract.createTournament(
      payoutBps,
      checksummedVerifier,
      BigInt(deadlineUnix),
      {
        value: prizePoolAvaxWei,
        ...(overrides ?? {}),
      }
    );
    const rcpt: ethers.TransactionReceipt | null = await tx.wait();
    if (!rcpt) throw new Error("Transaction was mined but returned no receipt.");

    let tournamentId = 0;
    for (const log of rcpt.logs) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed && parsed.name === "TournamentCreated") {
          tournamentId = Number(parsed.args.tournamentId);
          break;
        }
      } catch {
        // ignore logs from other interfaces
      }
    }

    if (!tournamentId) {
      const nextId = await this.nextTournamentId();
      tournamentId = nextId - 1;
    }

    return { tournamentId, txHash: rcpt.hash };
  }

  /**
   * Fund a new tournament prize pool with an ERC-20 token deposit.
   * Note: The caller must have approved the AMPTournamentCup contract to spend `amount`.
   *
   * @param tokenAddress ERC-20 contract address
   * @param amount Deposit amount in token atomic units
   * @param payoutBps Per-placement share in basis points (sum = 10000)
   * @param verifierAddress Verifier address authorized to attest final standings
   * @param deadlineUnix Unix timestamp deadline
   * @param overrides Optional ethers transaction overrides
   */
  async createTournamentERC20(
    tokenAddress: string,
    amount: bigint,
    payoutBps: number[],
    verifierAddress: string,
    deadlineUnix: number,
    overrides?: ethers.Overrides
  ): Promise<{ tournamentId: number; txHash: string }> {
    const checksummedToken = validateAndChecksumAddress(tokenAddress);
    const checksummedVerifier = validateAndChecksumAddress(verifierAddress);
    const signerContract = await this.getSignerContract();

    const tx = await signerContract.createTournamentERC20(
      checksummedToken,
      amount,
      payoutBps,
      checksummedVerifier,
      BigInt(deadlineUnix),
      overrides ?? {}
    );
    const rcpt: ethers.TransactionReceipt | null = await tx.wait();
    if (!rcpt) throw new Error("Transaction was mined but returned no receipt.");

    let tournamentId = 0;
    for (const log of rcpt.logs) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed && parsed.name === "TournamentCreated") {
          tournamentId = Number(parsed.args.tournamentId);
          break;
        }
      } catch {}
    }

    if (!tournamentId) {
      const nextId = await this.nextTournamentId();
      tournamentId = nextId - 1;
    }

    return { tournamentId, txHash: rcpt.hash };
  }

  /**
   * Pull-claim prize for a specific placement.
   * Caller must be the attested winner at `placement`.
   *
   * @param tournamentId Tournament ID
   * @param placement 0-based placement index (0 = 1st place)
   * @param overrides Optional ethers transaction overrides
   */
  async claimPrize(
    tournamentId: number | bigint,
    placement: number,
    overrides?: ethers.Overrides
  ): Promise<ethers.TransactionReceipt> {
    const signerContract = await this.getSignerContract();
    const tx = await signerContract.claimPrize(
      BigInt(tournamentId),
      BigInt(placement),
      overrides ?? {}
    );
    const rcpt: ethers.TransactionReceipt | null = await tx.wait();
    if (!rcpt) throw new Error("Transaction was mined but returned no receipt.");
    return rcpt;
  }

  /**
   * Attest tournament final standings using a verifier's EIP-712 signature.
   * Anyone may submit this transaction; validity is enforced by the verifier's signature.
   *
   * @param tournamentId Tournament ID
   * @param winners Ranked winner addresses (index 0 = 1st place)
   * @param signature Verifier's EIP-712 signature
   * @param overrides Optional ethers transaction overrides
   */
  async finalizeTournament(
    tournamentId: number | bigint,
    winners: string[],
    signature: string,
    overrides?: ethers.Overrides
  ): Promise<ethers.TransactionReceipt> {
    const checksummedWinners = validateAndChecksumAddresses(winners);
    const signerContract = await this.getSignerContract();
    const tx = await signerContract.finalizeTournament(
      BigInt(tournamentId),
      checksummedWinners,
      signature,
      overrides ?? {}
    );
    const rcpt: ethers.TransactionReceipt | null = await tx.wait();
    if (!rcpt) throw new Error("Transaction was mined but returned no receipt.");
    return rcpt;
  }

  /**
   * Refund the sponsor. Allowed by sponsor while OPEN before the deadline,
   * or by anyone once the deadline has passed unfinalized.
   *
   * @param tournamentId Tournament ID
   * @param overrides Optional ethers transaction overrides
   */
  async cancelTournament(
    tournamentId: number | bigint,
    overrides?: ethers.Overrides
  ): Promise<ethers.TransactionReceipt> {
    const signerContract = await this.getSignerContract();
    const tx = await signerContract.cancelTournament(
      BigInt(tournamentId),
      overrides ?? {}
    );
    const rcpt: ethers.TransactionReceipt | null = await tx.wait();
    if (!rcpt) throw new Error("Transaction was mined but returned no receipt.");
    return rcpt;
  }

  // ───────────────────────── EIP-712 Attestation Helpers ─────────────────────────

  /**
   * Sign an EIP-712 tournament result attestation using the client's configured signer.
   *
   * @param tournamentId Tournament ID
   * @param winners Ordered list of winner addresses
   */
  async signFinalize(
    tournamentId: number | bigint,
    winners: string[]
  ): Promise<string> {
    const signer = await this.getSigner();
    return signFinalizeUtil(signer, tournamentId, winners, {
      chainId: this.chainId,
      contractAddress: this.contractAddress,
    });
  }

  /**
   * Compute the 32-byte EIP-712 digest for tournament finalization.
   */
  computeFinalizeDigest(
    tournamentId: number | bigint,
    winners: string[]
  ): string {
    return computeFinalizeDigest({
      tournamentId,
      winners,
      chainId: this.chainId,
      contractAddress: this.contractAddress,
    });
  }

  /**
   * Recover the signer address from an EIP-712 finalization signature.
   */
  verifyFinalizeSignature(
    tournamentId: number | bigint,
    winners: string[],
    signature: string
  ): string {
    return verifyFinalizeSignatureUtil(tournamentId, winners, signature, {
      chainId: this.chainId,
      contractAddress: this.contractAddress,
    });
  }
}
