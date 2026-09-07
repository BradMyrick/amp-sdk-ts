/**
 * Built-in signer implementations.
 *
 * - InjectedWalletSigner: uses window.ethereum (MetaMask, Rabby, etc.)
 * - PrivateKeySigner: uses a raw private key (server-side, testing)
 *
 * Game devs can also implement the AMPSigner interface themselves
 * for custom wallet solutions (hardware wallets, MPC, etc.).
 */

import type { AMPSigner, TypedData } from "../types/signer.js";
import { toHex } from "../crypto/helpers.js";

/** Check if an injected Ethereum provider is available. */
function getInjectedProvider(): Record<string, unknown> | null {
  if (typeof globalThis === "undefined") return null;
  const eth = (globalThis as Record<string, unknown>).ethereum;
  return eth ? (eth as Record<string, unknown>) : null;
}

/**
 * Signer backed by a browser-injected wallet (MetaMask, Rabby, etc.).
 * Uses eth_requestAccounts + personal_sign + eth_signTypedData_v4.
 */
export class InjectedWalletSigner implements AMPSigner {
  private provider: Record<string, unknown>;

  constructor() {
    this.provider = getInjectedProvider() ?? {};
    if (!this.provider) {
      throw new Error(
        "No injected wallet found. Install MetaMask or use PrivateKeySigner.",
      );
    }
  }

  private async request(method: string, params: unknown[]): Promise<unknown> {
    const req = this.provider as { request: (args: { method: string; params: unknown[] }) => Promise<unknown> };
    return req.request({ method, params });
  }

  async getAddress(): Promise<string> {
    const accounts = (await this.request("eth_requestAccounts", [])) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error("Wallet returned no accounts");
    }
    return accounts[0];
  }

  async signPersonalSign(message: string): Promise<string> {
    const address = await this.getAddress();
    return (await this.request("personal_sign", [
      toHex(message),
      address,
    ])) as string;
  }

  async signTypedData(typedData: TypedData): Promise<string> {
    const address = await this.getAddress();
    return (await this.request("eth_signTypedData_v4", [
      address,
      JSON.stringify(typedData),
    ])) as string;
  }
}

/**
 * Signer backed by a raw private key. For server-side games and testing.
 * Uses ethers.js Wallet internally.
 *
 * IMPORTANT: Never expose private keys in browser code.
 * This signer is for Node.js backends and automated tests only.
 */
export class PrivateKeySigner implements AMPSigner {
  private wallet!: {
    address: string;
    signMessage: (msg: string) => Promise<string>;
    signTypedData: (td: TypedData) => Promise<string>;
  };
  private ready: Promise<void>;

  constructor(privateKey: string) {
    this.ready = (async () => {
      const { ethers } = await import("ethers");
      const w = new ethers.Wallet(privateKey);
      this.wallet = {
        address: w.address,
        signMessage: async (msg: string) => w.signMessage(msg),
        signTypedData: async (td: TypedData) =>
          w.signTypedData(td.domain, td.types, td.message),
      };
    })();
  }

  async getAddress(): Promise<string> {
    await this.ready;
    return this.wallet.address;
  }

  async signPersonalSign(message: string): Promise<string> {
    await this.ready;
    return this.wallet.signMessage(message);
  }

  async signTypedData(typedData: TypedData): Promise<string> {
    await this.ready;
    return this.wallet.signTypedData(typedData);
  }
}
