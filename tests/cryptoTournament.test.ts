import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  AMPTournamentClient,
  PrivateKeySigner,
  DEFAULT_CUP_ADDRESS,
  DEFAULT_FUJI_CHAIN_ID,
  EIP712_DOMAIN_NAME,
  EIP712_DOMAIN_VERSION,
  TOURNAMENT_RESULT_TYPES,
  hashWinners,
  computeFinalizeDigest,
  signFinalize,
  verifyFinalizeSignature,
  validateAndChecksumAddress,
  validateAndChecksumAddresses,
} from "../src/index.js";

describe("EIP-712 Finalization & Crypto Helpers", () => {
  const verifierKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const verifierWallet = new ethers.Wallet(verifierKey);

  const winners = [
    "0x1563915e194D8CfBA1943570603F7606A3115508",
    "0x5CbDd86a2FA8Dc4bDdd8a8f69dBa48572EeC07FB",
  ];

  it("validates and checksums valid Ethereum addresses", () => {
    const raw = "0x7c743c1c9ae3e7a65d030098f2249b7787d66dff";
    const checksummed = validateAndChecksumAddress(raw);
    expect(checksummed).toBe("0x7C743c1C9AE3e7A65d030098F2249B7787d66dfF");
    expect(validateAndChecksumAddresses(winners)).toEqual(winners);
  });

  it("rejects invalid Ethereum addresses", () => {
    expect(() => validateAndChecksumAddress("0xinvalid")).toThrow(/Invalid Ethereum address/);
    expect(() => validateAndChecksumAddress("not-an-address")).toThrow(/Invalid Ethereum address/);
  });

  it("hashWinners matches OpenZeppelin address array encoding", () => {
    // OZ: keccak256(abi.encodePacked(words)) where words[i] = bytes32(uint256(uint160(winners[i])))
    const words = winners.map((w) => ethers.zeroPadValue(w, 32));
    const expected = ethers.keccak256(ethers.concat(words));
    const computed = hashWinners(winners);
    expect(computed).toBe(expected);
  });

  it("computeFinalizeDigest matches standard EIP-712 digest", () => {
    const tournamentId = 42n;
    const domain = {
      name: EIP712_DOMAIN_NAME,
      version: EIP712_DOMAIN_VERSION,
      chainId: DEFAULT_FUJI_CHAIN_ID,
      verifyingContract: DEFAULT_CUP_ADDRESS,
    };
    const expectedDigest = ethers.TypedDataEncoder.hash(
      domain,
      TOURNAMENT_RESULT_TYPES,
      { tournamentId, winners }
    );

    const client = new AMPTournamentClient();
    const digestFromClient = client.computeFinalizeDigest(tournamentId, winners);
    const digestFromHelper = computeFinalizeDigest({ tournamentId, winners });

    expect(digestFromClient).toBe(expectedDigest);
    expect(digestFromHelper).toBe(expectedDigest);
  });

  it("signFinalize signs with ethers.Wallet and verifyFinalizeSignature recovers signer", async () => {
    const tournamentId = 101;
    const signature = await signFinalize(verifierWallet, tournamentId, winners);

    const recovered = verifyFinalizeSignature(tournamentId, winners, signature);
    expect(recovered.toLowerCase()).toBe(verifierWallet.address.toLowerCase());
  });

  it("signFinalize signs with PrivateKeySigner and AMPTournamentClient", async () => {
    const signer = new PrivateKeySigner(verifierKey);
    const client = new AMPTournamentClient({ signer });

    const tournamentId = 5;
    const signature = await client.signFinalize(tournamentId, winners);
    const recovered = client.verifyFinalizeSignature(tournamentId, winners, signature);

    expect(recovered.toLowerCase()).toBe((await signer.getAddress()).toLowerCase());
  });
});
