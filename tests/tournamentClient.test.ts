import { describe, it, expect, vi } from "vitest";
import { ethers } from "ethers";
import {
  AMPTournamentClient,
  CupState,
  DEFAULT_CUP_ADDRESS,
  DEFAULT_FUJI_CHAIN_ID,
  DEFAULT_FUJI_RPC,
  PrivateKeySigner,
} from "../src/index.js";

describe("AMPTournamentClient Unit Tests", () => {
  const dummyKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const dummyAddress = ethers.computeAddress(dummyKey);

  it("initializes with default Avalanche Fuji settings", () => {
    const client = new AMPTournamentClient();
    expect(client.rpcUrl).toBe(DEFAULT_FUJI_RPC);
    expect(client.chainId).toBe(DEFAULT_FUJI_CHAIN_ID);
    expect(client.contractAddress).toBe(DEFAULT_CUP_ADDRESS);
  });

  it("initializes with custom network settings", () => {
    const customAddr = "0x1111111111111111111111111111111111111111";
    const client = new AMPTournamentClient({
      rpcUrl: "http://127.0.0.1:8545",
      chainId: 1337,
      contractAddress: customAddr,
    });
    expect(client.rpcUrl).toBe("http://127.0.0.1:8545");
    expect(client.chainId).toBe(1337);
    expect(client.contractAddress).toBe(customAddr);
  });

  it("supports PrivateKeySigner, raw private key, and ethers.Wallet", async () => {
    // 1. Private key string
    const client1 = new AMPTournamentClient({ signer: dummyKey });
    expect(await client1.getSignerAddress()).toBe(dummyAddress);

    // 2. PrivateKeySigner
    const pkSigner = new PrivateKeySigner(dummyKey);
    const client2 = new AMPTournamentClient({ signer: pkSigner });
    expect(await client2.getSignerAddress()).toBe(dummyAddress);

    // 3. ethers.Wallet
    const wallet = new ethers.Wallet(dummyKey);
    const client3 = new AMPTournamentClient({ signer: wallet });
    expect(await client3.getSignerAddress()).toBe(dummyAddress);
  });

  it("clones client with new signer using connect()", async () => {
    const client = new AMPTournamentClient();
    const connected = client.connect(dummyKey);
    expect(await connected.getSignerAddress()).toBe(dummyAddress);
    expect(connected.contractAddress).toBe(client.contractAddress);
  });

  it("throws descriptive error when write methods are called without a signer", async () => {
    const readOnlyClient = new AMPTournamentClient();
    await expect(
      readOnlyClient.claimPrize(1, 0)
    ).rejects.toThrow(/No signer configured/);
  });

  describe("Mocked Contract Interactions", () => {
    it("parses getTournament details correctly", async () => {
      const client = new AMPTournamentClient();

      const mockRawTournament = {
        sponsor: "0x95cc495df579981d3ffa4a8f77b93a17563e077a",
        token: ethers.ZeroAddress,
        prizePool: ethers.parseEther("2.5"),
        payoutBps: [6000n, 3000n, 1000n],
        verifier: dummyAddress,
        winners: [
          "0x1111111111111111111111111111111111111111",
          "0x2222222222222222222222222222222222222222",
          "0x3333333333333333333333333333333333333333",
        ],
        state: 1n, // FINALIZED
        createdAt: 1700000000n,
        finalizeDeadline: 1700100000n,
      };

      vi.spyOn(client.contract, "getTournament").mockResolvedValue(mockRawTournament as any);

      const details = await client.getTournament(1);
      expect(details.id).toBe(1n);
      expect(details.isNativeAvax).toBe(true);
      expect(details.prizePool).toBe(ethers.parseEther("2.5"));
      expect(details.prizePoolFormatted).toBe("2.5");
      expect(details.payoutBps).toEqual([6000, 3000, 1000]);
      expect(details.state).toBe(CupState.FINALIZED);
      expect(details.stateLabel).toBe("FINALIZED");
      expect(details.isFinalized).toBe(true);
      expect(details.isOpen).toBe(false);
      expect(details.createdAtDate.getTime()).toBe(1700000000 * 1000);
    });

    it("evaluates getClaimablePrize accurately net of protocol fee", async () => {
      const client = new AMPTournamentClient();

      const winner1 = "0x1111111111111111111111111111111111111111";
      const winner2 = "0x2222222222222222222222222222222222222222";

      const mockRawTournament = {
        sponsor: dummyAddress,
        token: ethers.ZeroAddress,
        prizePool: ethers.parseEther("1.0"), // 1.0 AVAX
        payoutBps: [7000n, 3000n], // 70%, 30%
        verifier: dummyAddress,
        winners: [winner1, winner2],
        state: 1n, // FINALIZED
        createdAt: 1700000000n,
        finalizeDeadline: 1700100000n,
      };

      vi.spyOn(client.contract, "getTournament").mockResolvedValue(mockRawTournament as any);
      vi.spyOn(client.contract, "protocolFeeBps").mockResolvedValue(200n as any); // 2% protocol fee
      vi.spyOn(client.contract, "claimed").mockImplementation(async (_tid, placement) => {
        return Number(placement) === 0 ? false : true; // 1st place unclaimed, 2nd claimed
      });

      // 1st place winner: 1.0 AVAX * 70% = 0.70 AVAX. Fee = 0.70 * 2% = 0.014 AVAX. Net = 0.686 AVAX.
      const prize1 = await client.getClaimablePrize(1, winner1);
      expect(prize1).not.toBeNull();
      expect(prize1?.placement).toBe(0);
      expect(prize1?.placementRank).toBe(1);
      expect(prize1?.grossAmount).toBe(ethers.parseEther("0.7"));
      expect(prize1?.protocolFee).toBe(ethers.parseEther("0.014"));
      expect(prize1?.netAmount).toBe(ethers.parseEther("0.686"));
      expect(prize1?.formattedAmount).toBe("0.686");
      expect(prize1?.isClaimed).toBe(false);

      // 2nd place winner: already claimed -> returns null by default
      const prize2Unclaimed = await client.getClaimablePrize(1, winner2);
      expect(prize2Unclaimed).toBeNull();

      // 2nd place winner with includeClaimed: true
      const prize2WithClaimed = await client.getClaimablePrize(1, winner2, {
        includeClaimed: true,
      });
      expect(prize2WithClaimed).not.toBeNull();
      expect(prize2WithClaimed?.isClaimed).toBe(true);

      // Non-winner returns null
      const nonWinner = await client.getClaimablePrize(1, "0x9999999999999999999999999999999999999999");
      expect(nonWinner).toBeNull();
    });

    it("parses tournamentId from TournamentCreated event on createTournament", async () => {
      const client = new AMPTournamentClient({ signer: dummyKey });

      const fakeReceipt = {
        hash: "0xabcdef1234567890",
        logs: [
          client.contract.interface.encodeEventLog(
            client.contract.interface.getEvent("TournamentCreated")!,
            [
              42n, // tournamentId
              dummyAddress, // sponsor
              ethers.ZeroAddress, // token
              ethers.parseEther("1.0"), // prizePool
              dummyAddress, // verifier
            ]
          ),
        ],
      };

      const mockTx = {
        wait: vi.fn().mockResolvedValue(fakeReceipt),
      };

      const mockContract = {
        createTournament: vi.fn().mockResolvedValue(mockTx),
      };

      vi.spyOn(client as any, "getSignerContract").mockResolvedValue(mockContract);

      const res = await client.createTournament(
        [10000],
        dummyAddress,
        1800000000,
        ethers.parseEther("1.0")
      );

      expect(res.tournamentId).toBe(42);
      expect(res.txHash).toBe("0xabcdef1234567890");
    });

    it("calls claimPrize and waits for transaction receipt", async () => {
      const client = new AMPTournamentClient({ signer: dummyKey });

      const fakeReceipt = {
        hash: "0xclaimreceipt123",
        status: 1,
      };

      const mockTx = {
        wait: vi.fn().mockResolvedValue(fakeReceipt),
      };

      const mockContract = {
        claimPrize: vi.fn().mockResolvedValue(mockTx),
      };

      vi.spyOn(client as any, "getSignerContract").mockResolvedValue(mockContract);

      const rcpt = await client.claimPrize(1, 0);
      expect(rcpt.hash).toBe("0xclaimreceipt123");
      expect(mockContract.claimPrize).toHaveBeenCalledWith(1n, 0n, {});
    });

    it("calls finalizeTournament with checksummed winners and signature", async () => {
      const client = new AMPTournamentClient({ signer: dummyKey });

      const fakeReceipt = {
        hash: "0xfinalizereceipt456",
        status: 1,
      };

      const mockTx = {
        wait: vi.fn().mockResolvedValue(fakeReceipt),
      };

      const mockContract = {
        finalizeTournament: vi.fn().mockResolvedValue(mockTx),
      };

      vi.spyOn(client as any, "getSignerContract").mockResolvedValue(mockContract);

      const rawWinner = "0x1111111111111111111111111111111111111111";
      const rcpt = await client.finalizeTournament(1, [rawWinner], "0xsig");

      expect(rcpt.hash).toBe("0xfinalizereceipt456");
      expect(mockContract.finalizeTournament).toHaveBeenCalledWith(
        1n,
        [ethers.getAddress(rawWinner)],
        "0xsig",
        {}
      );
    });

    it("calls cancelTournament and waits for receipt", async () => {
      const client = new AMPTournamentClient({ signer: dummyKey });

      const fakeReceipt = {
        hash: "0xcancelreceipt789",
        status: 1,
      };

      const mockTx = {
        wait: vi.fn().mockResolvedValue(fakeReceipt),
      };

      const mockContract = {
        cancelTournament: vi.fn().mockResolvedValue(mockTx),
      };

      vi.spyOn(client as any, "getSignerContract").mockResolvedValue(mockContract);

      const rcpt = await client.cancelTournament(1);
      expect(rcpt.hash).toBe("0xcancelreceipt789");
      expect(mockContract.cancelTournament).toHaveBeenCalledWith(1n, {});
    });
  });
});
