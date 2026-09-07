/**
 * Low-level REST client for the AMP matchmaker API.
 * Handles fetch, auth headers, and error normalization.
 */

import { AMPError } from "../types/api.js";

export interface RestClientOptions {
  baseUrl: string;
  timeout?: number;
}

export class RestClient {
  private baseUrl: string;
  private timeout: number;
  private token: string | null = null;

  constructor(opts: RestClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.timeout = opts.timeout ?? 10_000;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new AMPError("timeout", `Request to ${path} timed out after ${this.timeout}ms`);
      }
      throw new AMPError(
        "network",
        `Cannot reach the matchmaker at ${this.baseUrl}. Check your connection.`,
      );
    }
    clearTimeout(timer);

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new AMPError(
        (json as { error?: string }).error ?? "unknown",
        (json as { message?: string }).message ?? res.statusText,
        res.status,
      );
    }

    return json as T;
  }
}
