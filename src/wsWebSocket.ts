import { CloseEvent as ws$CloseEvent, ErrorEvent as ws$ErrorEvent, Event as ws$Event, MessageEvent as ws$MessageEvent, WebSocket as ws$WebSocket } from "ws"

export { wsWebSocket }

// But then see: https://stackoverflow.com/questions/52299063/why-im-able-to-access-websocket-native-browser-object-in-node-jest
/** 
 * A WebSocket implemented as a wrapper around a ws.WebSocket.
 * Delegate everything to wss: ws.WebSocket
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
  // Pro-forma methods must be declared; 
  // There no Event invocations from DOM coming upstream; not even a DOM Event Dispatcher.
  // because this only run in Node.js; 
  // Application needs to cast back to 'ws' Event or use .addEventListener()
  onclose: (ev: CloseEvent) => void;
  onerror: (ev: Event) => void
  onopen: (ev: Event) => void
  onmessage: (ev: MessageEvent<Uint8Array>) => void
  // the above are set by BaseDriver.connectWebSocket! 
  // which forwards them upstream & invokes DispatchEvent(ev)
  // a *real* ws.WebSocket.js appears to make the methods unalterable: 
  // set onclose(listener) {}; get onclose() {return undefined}
  // below we set the wss.onopen(ev) to call this.onpen(ev); which works: because counters++

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
    this.wss.onopen = (ev: ws$Event) => { wsWebSocket.socketsOpened++; this.onopen(ev as any)}
    this.wss.onclose = (ev: ws$CloseEvent) => { wsWebSocket.socketsClosed++; this.onclose(ev as any)}
    this.wss.onerror = (ev: ws$ErrorEvent) => { this.onerror(ev as any)}
    this.wss.onmessage = (ev: ws$MessageEvent) => { this.onmessage(ev as any)} // ev.data is common
    // Dubious event casting above, but at least you get a signal
    // SocketServerDriver overrides: this.wss.onmessage(ev) => this.wsmessage(ev.data)
  }
}
