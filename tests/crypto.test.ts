import { describe, it, expect } from "vitest";
import {
  computeCommitHash,
  generateSalt,
  buildLadderTypedData,
  buildReportMessage,
  buildExitCertMessage,
  toHex,
} from "../src/crypto/helpers.js";
import { ethers } from "ethers";

describe("computeCommitHash", () => {
  it("produces a keccak256 hash of the concatenated inputs", async () => {
    const wallet = "0x95CC495dF579981d3Ffa4a8f77B93A17563E077a";
    const stake = 1000000000000000n;
    const salt = "test-salt-value";

    const hash = await computeCommitHash(wallet, stake, salt);

    // Verify manually
    const addrBytes = ethers.getBytes(ethers.getAddress(wallet));
    const stakeBytes = ethers.toBeHex(stake, 8);
    const saltBytes = ethers.toUtf8Bytes(salt);
    const expected = ethers.keccak256(
      ethers.concat([addrBytes, ethers.getBytes(stakeBytes), saltBytes]),
    );

    expect(hash).toBe(expected);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic for the same inputs", async () => {
    const wallet = "0x95CC495dF579981d3Ffa4a8f77B93A17563E077a";
    const a = await computeCommitHash(wallet, 100, "salt");
    const b = await computeCommitHash(wallet, 100, "salt");
    expect(a).toBe(b);
  });

  it("is sensitive to each input", async () => {
    const wallet = "0x95CC495dF579981d3Ffa4a8f77B93A17563E077a";
    const base = await computeCommitHash(wallet, 100, "salt");
    const wrongStake = await computeCommitHash(wallet, 200, "salt");
    const wrongSalt = await computeCommitHash(wallet, 100, "other");
    expect(base).not.toBe(wrongStake);
    expect(base).not.toBe(wrongSalt);
  });
});

describe("generateSalt", () => {
  it("produces a 0x-prefixed 64-character hex string", () => {
    const salt = generateSalt();
    expect(salt).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces unique values", () => {
    const salts = new Set(Array.from({ length: 100 }, () => generateSalt()));
    expect(salts.size).toBe(100);
  });
});

describe("buildLadderTypedData", () => {
  it("constructs the correct EIP-712 typed data", () => {
    const td = buildLadderTypedData({
      chainId: 43113,
      contractAddress: "0xcabf7b626172fE55d54f03c346563671AbcC77f7",
      matchId: "0x" + "a".repeat(64),
      gameId: "0x" + "0".repeat(63) + "1",
      rankedPlacements: [
        "0x95CC495dF579981d3Ffa4a8f77B93A17563E077a",
        "0x79aDcEF0E2bdc030f5906aA80C6B50C3712c0064",
      ],
      transcriptHash: "0x" + "b".repeat(64),
      sessionNonce: 42,
    });

    expect(td.domain.name).toBe("AMPMultiplayer");
    expect(td.domain.version).toBe("1");
    expect(td.domain.chainId).toBe(43113);
    expect(td.primaryType).toBe("MultiplayerLadder");
    expect(td.types.MultiplayerLadder).toHaveLength(5);
    expect(td.message.matchId).toBe("0x" + "a".repeat(64));
    expect(td.message.rankedPlacements).toHaveLength(2);
  });
});

describe("buildReportMessage", () => {
  it("formats the canonical EIP-191 report message", () => {
    const msg = buildReportMessage("match-123", "win");
    expect(msg).toBe("AMP_REPORT:v1:match-123:win");
  });

  it("includes loss and draw", () => {
    expect(buildReportMessage("m", "loss")).toBe("AMP_REPORT:v1:m:loss");
    expect(buildReportMessage("m", "draw")).toBe("AMP_REPORT:v1:m:draw");
  });
});

describe("cross-SDK EIP-712 golden digest", () => {
  it("buildLadderTypedData hashes to the ethers/contract reference digest", async () => {
    const { ethers } = await import("ethers");
    const typed = buildLadderTypedData({
      chainId: 43113,
      contractAddress: "0xcabf7b626172fE55d54f03c346563671AbcC77f7",
      matchId: "0x" + "a".repeat(64),
      gameId: "0x" + "0".repeat(63) + "1",
      rankedPlacements: [
        "0x95CC495dF579981d3Ffa4a8f77B93A17563E077a",
        "0x79aDcEF0E2bdc030f5906aA80C6B50C3712c0064",
      ],
      transcriptHash: "0x" + "b".repeat(64),
      sessionNonce: 42,
    });
    const digest = ethers.TypedDataEncoder.hash(
      typed.domain, typed.types as never, typed.message,
    );
    expect(digest).toBe(
      "0x7e3467e6d14daf2c2ba195a1147c550a480c30c867c202b7b02e385a8e48123f",
    );
  });
});

describe("buildExitCertMessage", () => {
  it("matches the amp-server format exactly", () => {
    const msg = buildExitCertMessage("m-42", 3, 1200, "0xabc");
    expect(msg).toBe(
      "AMP exit certificate\n\n" +
        "Match: m-42\n" +
        "Rank: 3\n" +
        "Exit frame: 1200\n" +
        "State hash: 0xabc\n\n" +
        "This signature is free. It certifies your elimination and unlocks your reporting bond.",
    );
  });
});

describe("cross-SDK golden vector", () => {
  it("computeCommitHash matches the server encoding (addr20 ‖ stake8 ‖ salt-utf8)", async () => {
    // Reference vector identical in the TS/C#/C++/Rust SDKs and amp-server.
    const h = await computeCommitHash(
      "0x95CC495dF579981d3Ffa4a8f77B93A17563E077a",
      1_000_000_000_000_000,
      "0xdeadbeef",
    );
    expect(h.toLowerCase()).toBe(
      "0x2d5491f1ad0117eea0c302b3cfb07590fef2d3892349e017361afd1bb5e5be10",
    );
  });
});

describe("toHex", () => {
  it("encodes ASCII strings", () => {
    expect(toHex("hello")).toBe("0x68656c6c6f");
  });

  it("handles empty strings", () => {
    expect(toHex("")).toBe("0x");
  });
});
