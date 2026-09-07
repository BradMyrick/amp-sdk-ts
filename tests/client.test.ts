import { describe, it, expect } from "vitest";
import { AMPClient } from "../src/client/amp.js";
import { PrivateKeySigner } from "../src/signers/index.js";

describe("AMPClient", () => {
  it("constructs with a server URL and signer", () => {
    const signer = new PrivateKeySigner(
      "0x" + "a".repeat(64),
    );
    const amp = new AMPClient({
      serverUrl: "https://amp.playwithamp.xyz",
      signer,
    });

    expect(amp).toBeDefined();
    expect(amp.authenticated).toBe(false);
    expect(amp.wallet).toBeNull();
  });

  it("constructs with custodial provider", () => {
    const amp = new AMPClient({
      serverUrl: "https://amp.playwithamp.xyz",
      custodial: {
        getAddress: async () => "0x0000000000000000000000000000000000000001",
        signPersonalSign: async () => "0x" + "0".repeat(130),
        signTypedData: async () => "0x" + "0".repeat(130),
        fundMatch: async () => {},
        withdrawWinnings: async () => {},
      },
      playerId: "player-123",
    });

    expect(amp).toBeDefined();
  });

  it("throws on login without signer or custodial", async () => {
    const amp = new AMPClient({
      serverUrl: "https://amp.playwithamp.xyz",
    });

    await expect(amp.login()).rejects.toThrow(
      "No signer or custodial provider configured",
    );
  });

  it("exposes queue, party, and multiplayer methods", () => {
    const amp = new AMPClient({
      serverUrl: "https://example.com",
      custodial: {
        getAddress: async () => "0x0000000000000000000000000000000000000001",
        signPersonalSign: async () => "0x",
        signTypedData: async () => "0x",
        fundMatch: async () => {},
        withdrawWinnings: async () => {},
      },
      playerId: "p1",
    });

    expect(typeof amp.joinQueue).toBe("function");
    expect(typeof amp.leaveQueue).toBe("function");
    expect(typeof amp.queueStatus).toBe("function");
    expect(typeof amp.playBot).toBe("function");
    expect(typeof amp.createParty).toBe("function");
    expect(typeof amp.joinParty).toBe("function");
    expect(typeof amp.reportMatch).toBe("function");
    expect(typeof amp.multiCommit).toBe("function");
    expect(typeof amp.multiReport).toBe("function");
    expect(typeof amp.multiClaim).toBe("function");
    expect(typeof amp.on).toBe("function");
    expect(typeof amp.disconnect).toBe("function");
  });
});

describe("PrivateKeySigner", () => {
  it("derives the correct address from a private key", async () => {
    const key = "0x" + "d" + "b".repeat(63); // deterministic test key
    const signer = new PrivateKeySigner(key);
    const addr = await signer.getAddress();
    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("signs personal messages", async () => {
    const key = "0x" + "d" + "b".repeat(63);
    const signer = new PrivateKeySigner(key);
    const sig = await signer.signPersonalSign("hello world");
    expect(sig).toMatch(/^0x[0-9a-f]{130}$/);
  });
});
