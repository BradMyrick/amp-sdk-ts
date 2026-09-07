/**
 * WebSocket client with exponential-backoff auto-reconnect.
 * Typed event emitter — game code gets full autocomplete on event names
 * and payloads.
 */

import type { WsEventMap, WsEventType } from "../types/api.js";

export type WsEventHandler<K extends WsEventType> = (
  data: WsEventMap[K],
) => void;

export class AMPWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private closed = false;
  private attempt = 0;
  private handlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(baseUrl: string, token: string) {
    this.url = `${baseUrl.replace(/^http/, "ws")}/v1/ws?token=${encodeURIComponent(token)}`;
  }

  on<K extends WsEventType>(event: K, handler: WsEventHandler<K>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as (data: unknown) => void);
    return () => this.off(event, handler);
  }

  off<K extends WsEventType>(event: K, handler: WsEventHandler<K>): void {
    this.handlers.get(event)?.delete(handler as (data: unknown) => void);
  }

  connect(): void {
    if (this.closed) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.attempt = 0;
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        const handlers = this.handlers.get(msg.type);
        if (handlers) {
          for (const h of handlers) {
            h(msg.data ?? {});
          }
        }
      } catch {
        // malformed message — ignore
      }
    };

    this.ws.onclose = () => {
      if (!this.closed) {
        this.attempt += 1;
        const delay = Math.min(1000 * 2 ** this.attempt, 15_000);
        setTimeout(() => this.connect(), delay);
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
    this.handlers.clear();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
