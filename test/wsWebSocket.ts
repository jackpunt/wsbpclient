import ws$WebSocket = require("ws");
import { stime } from "../src/types";

export { wsWebSocket, ws$WebSocket as ws }

/** 
 * a WebSocket implemented as a wrapper around a ws.WebSocket.
 * 
 * Suitable for mocking a browser WebSocket when running on Node.js (jest'ing)
 */
class wsWebSocket implements WebSocket {
  get binaryType(): BinaryType { return this.wss.binaryType as "arraybuffer" | "blob" };
  get bufferedAmount(): number { return this.wss.bufferedAmount };
  get extensions(): string { return this.wss.extensions };
  get protocol(): string { return this.wss.protocol };
  get readyState(): number { return this.wss.readyState };
  get url(): string { return this.wss.url };
  // dubious casting of Event objects: 
  // pro'ly there no such 'upstream' event invocations, use addEventListener
  // or interpose on this.wss to get real events (which we do for onmessage)
  onclose(ev: CloseEvent) { this.wss.onclose(ev as any as ws$WebSocket.CloseEvent)}
  onerror(ev: Event)      { this.wss.onerror(ev as any as ws$WebSocket.ErrorEvent)}
  onopen(ev: Event) { return this.wss.onopen(ev as any as ws$WebSocket.OpenEvent)}
  onmessage(ev: MessageEvent<Uint8Array>) { 
    this.wss.onmessage({type: ev.type, data: ev.data, target: this.wss}) //not invoked in Node.js
  }
  // This is the important bit, sending downstream:
  close(code?: number, reason?: string): void { this.wss.close(code, reason) };
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.wss.send(data)
  }
  get CONNECTING() {return this.wss.CONNECTING };
  get OPEN() { return this.wss.OPEN}
  get CLOSING() { return this.wss.CLOSING}
  get CLOSED() { return this.wss.CLOSING}
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
  constructor(url: string) {
    this.wss = new ws$WebSocket(url)
    this.wss.binaryType = 'arraybuffer';
  }
}
