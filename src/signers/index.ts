/**
 * Built-in signer implementations.
 *
 * - InjectedWalletSigner: uses window.ethereum (Core, MetaMask, Rabby, etc.)
 * - PrivateKeySigner: uses an ethers.Wallet with a private key (Node.js/server, testing)
 *
 * Game devs can also implement the AMPSigner interface or use ethers.Signer directly.
 */

import { ethers } from "ethers";
import type { AMPSigner, TypedData } from "../types/signer.js";
import { toHex } from "../crypto/helpers.js";

/** Check if an injected Ethereum provider is available in globalThis. */
function getInjectedProvider(): Record<string, unknown> | null {
  if (typeof globalThis === "undefined") return null;
  const eth = (globalThis as Record<string, unknown>).ethereum;
  return eth ? (eth as Record<string, unknown>) : null;
}

/**
 * Signer backed by a browser-injected wallet (Avalanche Core, MetaMask, Rabby, etc.).
 * Supports direct RPC calls, typed data signing, and ethers.BrowserProvider integration.
 */
export class InjectedWalletSigner implements AMPSigner {
  private provider: Record<string, unknown>;
  private browserProvider?: ethers.BrowserProvider;

  constructor(injectedProvider?: Record<string, unknown>) {
    this.provider = injectedProvider ?? getInjectedProvider() ?? {};
  }

  private ensureProvider(): Record<string, unknown> {
    if (!this.provider || Object.keys(this.provider).length === 0) {
      const detected = getInjectedProvider();
      if (detected) {
        this.provider = detected;
      } else {
        throw new Error(
          "No injected wallet found. Install Avalanche Core, MetaMask, or use PrivateKeySigner."
        );
      }
    }
    return this.provider;
  }

  private async request(method: string, params: unknown[] = []): Promise<unknown> {
    const eth = this.ensureProvider() as {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
    return eth.request({ method, params });
  }

  async getAddress(): Promise<string> {
    const accounts = (await this.request("eth_requestAccounts", [])) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error("Wallet returned no accounts");
    }
    return ethers.getAddress(accounts[0]);
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

  /**
   * Returns an ethers.BrowserProvider wrapping the injected provider.
   */
  getBrowserProvider(): ethers.BrowserProvider {
    const eth = this.ensureProvider();
    if (!this.browserProvider) {
      this.browserProvider = new ethers.BrowserProvider(eth as unknown as ethers.Eip1193Provider);
    }
    return this.browserProvider;
  }

  /**
   * Obtains an ethers.JsonRpcSigner from the browser provider.
   */
  async getEthersSigner(): Promise<ethers.JsonRpcSigner> {
    const bp = this.getBrowserProvider();
    return bp.getSigner();
  }

  /**
   * Prompts the wallet to switch (or add) the Avalanche Fuji C-Chain (Chain ID 43113).
   */
  async switchToFuji(rpcUrl = "https://api.avax-test.network/ext/bc/C/rpc"): Promise<void> {
    const chainIdHex = "0xA869"; // 43113
    try {
      await this.request("wallet_switchEthereumChain", [{ chainId: chainIdHex }]);
    } catch (switchError: unknown) {
      const code = (switchError as { code?: number })?.code;
      if (code === 4902 || code === -32603) {
        await this.request("wallet_addEthereumChain", [
          {
            chainId: chainIdHex,
            chainName: "Avalanche Fuji C-Chain",
            nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
            rpcUrls: [rpcUrl],
            blockExplorerUrls: ["https://testnet.snowtrace.io"],
          },
        ]);
      } else {
        throw switchError;
      }
    }
  }
}

/**
 * Signer backed by a raw private key. For Node.js servers, verifiers, and tests.
 * Wraps ethers.Wallet internally.
 */
export class PrivateKeySigner implements AMPSigner {
  readonly privateKey: string;
  readonly wallet: ethers.Wallet;

  constructor(privateKey: string, provider?: ethers.Provider) {
    const normalizedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    this.privateKey = normalizedKey;
    this.wallet = new ethers.Wallet(normalizedKey, provider);
  }

  async getAddress(): Promise<string> {
    return this.wallet.getAddress();
  }

  async signPersonalSign(message: string): Promise<string> {
    return this.wallet.signMessage(message);
  }

  async signTypedData(typedData: TypedData): Promise<string> {
    return this.wallet.signTypedData(
      typedData.domain,
      typedData.types,
      typedData.message
    );
  }

  /**
   * Returns the underlying ethers.Wallet, optionally connected to a provider.
   */
  getWallet(provider?: ethers.Provider): ethers.Wallet {
    return provider ? this.wallet.connect(provider) : this.wallet;
  }

  /**
   * Returns the ethers.Signer representation.
   */
  getEthersSigner(provider?: ethers.Provider): ethers.Wallet {
    return this.getWallet(provider);
  }
}
