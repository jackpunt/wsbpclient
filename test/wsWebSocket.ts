import * as ws$WebSocket from "ws";

/** 
 * a WebSocket implemented as a wrapper around a ws.WebSocket.
 * 
 * Suitable for mocking a browser WebSocket when running on Node.js (jest'ing)
 */
export class wsWebSocket implements WebSocket {
  get binaryType(): BinaryType { return this.wss.binaryType as "arraybuffer" | "blob" };
  get bufferedAmount(): number { return this.wss.bufferedAmount };
  get extensions(): string { return this.wss.extensions };
  get protocol(): string { return this.wss.protocol };
  get readyState(): number { return this.wss.readyState };
  get url(): string { return this.wss.url };
  onclose: (this: WebSocket, ev: CloseEvent) => any
    = function (this: WebSocket, ev: CloseEvent): any { (this as wsWebSocket).wss.onclose(ev as any as ws$WebSocket.CloseEvent); };
  onerror: (this: WebSocket, ev: Event) => any
    = function (this, ev) { (this as wsWebSocket).wss.onerror(ev as any as ws$WebSocket.ErrorEvent) };
  onmessage: (this: WebSocket, ev: MessageEvent<Uint8Array>) => any
    = function (this, ev) { 
      (this as wsWebSocket).wss.onmessage({type: ev.type, data: ev.data, target: (this as wsWebSocket).wss } as ws$WebSocket.MessageEvent) 
    };
  onopen: (this: WebSocket, ev: Event) => any
    = function (this: WebSocket, ev: Event) { return (this as wsWebSocket).wss.onopen(ev as any as ws$WebSocket.OpenEvent) };
  close(code?: number, reason?: string): void { this.wss.close(code, reason) };
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.wss.send(data)
  }
  CONNECTING: number = 0;
  OPEN: number = 1;
  CLOSING: number = 2;
  CLOSED: number = 3;
  addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: any, listener: any, options?: any) {
    this.wss.addEventListener(type, listener)
  }
  removeEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: any, listener: any, options?: any) {
    this.wss.addEventListener(type, listener)
  }
  dispatchEvent(event: Event): boolean {
    return this.wss.emit(event.type)
  }
  wss: ws$WebSocket
  ws: WebSocket
  constructor(url: string) {
    this.wss = new ws$WebSocket(url)
    this.wss.binaryType = 'arraybuffer';
    this.ws = this
  }
}
