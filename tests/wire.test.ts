/**
 * Wire-contract tests: assert the EXACT request bodies the SDK emits.
 * Drift class caught here: `inviteCode` vs `invite_code` (R9), numbers
 * sent as JSON strings (exit certs / commits), and any future field-name
 * or type drift — before it 422s in production.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AMPClient, PrivateKeySigner } from "../src/index.js";

const TEST_KEY =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

type Capture = { method: string; url: string; body: any };

function stubFetch() {
  const calls: Capture[] = [];
  const fetchMock = vi.fn(async (input: any, init: any = {}) => {
    const url = String(input);
    calls.push({
      method: init.method ?? "GET",
      url,
      body: init.body ? JSON.parse(init.body) : null,
    });
    let payload: unknown = { ok: true };
    if (url.includes("/v1/auth/challenge")) payload = { challenge: "challenge-1" };
    else if (url.includes("/v1/auth/verify")) payload = { token: "tok" };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  globalThis.fetch = fetchMock as any;
  return calls;
}

describe("wire contracts", () => {
  let calls: Capture[];
  let client: AMPClient;

  beforeEach(async () => {
    calls = stubFetch();
    client = new AMPClient({ serverUrl: "http://x", signer: new PrivateKeySigner(TEST_KEY) });
    await client.login();
  });

  const lastBody = () => calls[calls.length - 1].body;

  it("joinParty sends snake_case invite_code (server has no camelCase alias)", async () => {
    await client.joinParty("abc123");
    expect(lastBody()).toEqual({ invite_code: "ABC123" });
  });

  it("createParty sends snake_case game_id/ruleset_id", async () => {
    await client.createParty("g", "r");
    expect(lastBody()).toEqual({ game_id: "g", ruleset_id: "r" });
  });

  it("multiCommit sends stakeWei/lobbySize as JSON numbers", async () => {
    await client.multiCommit("g", 1000, 4);
    const b = lastBody();
    expect(typeof b.stakeWei).toBe("number");
    expect(typeof b.lobbySize).toBe("number");
    expect(b.stakeWei).toBe(1000);
    expect(b.lobbySize).toBe(4);
    expect(b.commitHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("submitExitCert sends rank/exitFrame as JSON numbers", async () => {
    await client.submitExitCert("m1", 3, 1200, "0xabc");
    const b = lastBody();
    expect(typeof b.rank).toBe("number");
    expect(typeof b.exitFrame).toBe("number");
    expect(b.rank).toBe(3);
    expect(b.exitFrame).toBe(1200);
    expect(b.stateHash).toBe("0xabc");
    expect(b.signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("countersignExitCert sends stateHash", async () => {
    await client.countersignExitCert("m1", "0xwall", "0xhash");
    expect(lastBody()).toEqual({ stateHash: "0xhash" });
  });

  it("multiReveal sends gameId/rulesetId/salt", async () => {
    await client.multiReveal("g", "r", "0xsalt");
    expect(lastBody()).toEqual({ gameId: "g", rulesetId: "r", salt: "0xsalt" });
  });

  it("queue join uses camelCase gameId/rulesetId", async () => {
    await client.joinQueue("g", "r");
    expect(lastBody()).toEqual({ gameId: "g", rulesetId: "r" });
  });

  it("multiReport sends ranked pairs and numeric sessionNonce", async () => {
    await client.multiReport("0x" + "ab".repeat(32), [["0x95CC495dF579981d3Ffa4a8f77B93A17563E077a", 1], ["0x79aDcEF0E2bdc030f5906aA80C6B50C3712c0064", 2]], "0x" + "cd".repeat(32), 42);
    const b = lastBody();
    expect(b.ranked).toEqual([["0x95CC495dF579981d3Ffa4a8f77B93A17563E077a", 1], ["0x79aDcEF0E2bdc030f5906aA80C6B50C3712c0064", 2]]);
    expect(b.sessionNonce).toBe(42);
    expect(b.transcriptHash).toBe("0x" + "cd".repeat(32));
    expect(b.signature).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("login challenge/verify use wallet+signature+challenge", async () => {
    const login = calls[0];
    expect(login.url).toContain("/v1/auth/challenge");
    expect(login.body).toEqual({ wallet: expect.any(String) });
    const verify = calls[1];
    expect(verify.url).toContain("/v1/auth/verify");
    expect(Object.keys(verify.body).sort()).toEqual(["challenge", "signature", "wallet"]);
  });
});
