import { WebSocket as ws$WebSocket } from "ws"
import type { CloseEvent as ws$CloseEvent, ErrorEvent as ws$ErrorEvent, Event as ws$Event, MessageEvent as ws$MessageEvent } from "ws"
import { stime } from "@thegraid/common-lib"

// But then see: https://stackoverflow.com/questions/52299063/why-im-able-to-access-websocket-native-browser-object-in-node-jest
/** 
 * A WebSocket implemented as a wrapper around a ws.WebSocket.
 * Delegate everything to wss: ws.WebSocket
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
  // Pro-forma methods must be declared; but are never invoked.
  // There no Event invocations from DOM coming upstream; not even a DOM Event Dispatcher.
  onclose: (ev: CloseEvent) => void;
  onerror: (ev: Event) => void
  onopen: (ev: Event) => void
  onmessage: (ev: MessageEvent<Uint8Array>) => void
  // setting ws.on${method}(func) is transmuted into: ws.addEventListener(method, func)
  // SO! do NOT set or call these method/attributes: just use wss.addEventListener()
  // and extract the needful from the ws$Event

  // This is the important bit, sending 'downstream' to inner-wss:
  close(code?: number, reason?: string): void { this.wss.close(code, reason) };
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.wss.send(data)
  }
  get CONNECTING() {return this.wss.CONNECTING };
  get OPEN() { return this.wss.OPEN}
  get CLOSING() { return this.wss.CLOSING}
  get CLOSED() { return this.wss.CLOSED}
  addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: any, listener: any, options?: any) {
    this.wss.addEventListener(type, listener)
  }
  removeEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: any, listener: any, options?: any) {
    this.wss.removeEventListener(type, listener)
  }
  dispatchEvent(event: Event): boolean {
    console.log('wsWebSocket.dispatchEvent invoked! event=', event)
    return this.wss.emit(event.type) // presumably the other event fields are not used TODO: close, error...
    // AH! in practice we do NOT invoke this.dispatchEvent() method
    // most signals passed by the onXXXX() => this.wss.onXXX()
  }
  static socketsOpened = 0 // for testing/debug because jest says there's an open socket.
  static socketsClosed = 0
  wss: ws$WebSocket
  constructor(url: string) {
    this.wss = new ws$WebSocket(url)
    this.wss.binaryType = 'arraybuffer';
    this.wss.addEventListener('open', (ev: ws$Event) => { wsWebSocket.socketsOpened++})
    this.wss.addEventListener('close', (ev: ws$CloseEvent) => { wsWebSocket.socketsClosed++})
  }
}
