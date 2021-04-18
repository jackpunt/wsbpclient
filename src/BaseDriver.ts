import type { AWebSocket, WebSocketDriver, DataBuf } from "./types";

/**
 * Stack drivers above a websocket.
 * INNER is closer to the websocket, aka downstream
 * OUTER is closer to the application, aka upstream
 * 
 */
export class BaseDriver<INNER extends DataBuf<any>, OUTER extends DataBuf<OUTER>> implements WebSocketDriver<INNER, OUTER> {
  dnstream: WebSocketDriver<any, INNER>; // next driver downstream
  upstream: WebSocketDriver<OUTER, any>; // next driver upstream

  connect(upstream: WebSocketDriver<OUTER, any>): void {
    this.upstream = upstream
  }
  onopen(ev: Event): void {
    if (!!this.upstream) this.upstream.onopen(ev)
  };
  onerror(ev: Event): void {
    if (!!this.upstream) this.upstream.onerror(ev)
  };
  onclose(ev: CloseEvent): void {
    if (!!this.upstream) this.upstream.onclose(ev)
  };
  /** process message from downstream. */
  wsmessage(data: DataBuf<INNER>): void {
    if (!!this.upstream) this.upstream.wsmessage(data)
  };

  sendBuffer(data: Uint8Array, ecb?: (error: Event | Error) => void): void {
    this.dnstream.sendBuffer(data)
  }
}

/**
 * Bottom of the websocket driver stack: connect actual WebSocket.
 * Send & Recieve messages over a WebSocket.
 */
export class WebSocketBase<INNER extends DataBuf<INNER>, OUTER extends DataBuf<OUTER>> extends BaseDriver<INNER, OUTER> {
  ws: AWebSocket;

  onmessage(ev: MessageEvent<INNER>): void {
    this.wsmessage(ev.data)
  };

  /** replace the usual connect(WebSocketDriver) 
   * @param ws the ws.WebSocket (or WebSocket or url) connection to be handled. (or null)
   * Can also be a SocketSender (ie another CnxHandler)
   * @param msg_handler optional override PbMessage handler; default: 'this'
  */
  connectws(ws: WebSocket | string) {
    if (typeof (ws) === 'string') {
      let url = ws;
      ws = new WebSocket(url); // TODO: handle failure of URL or connection
      ws.binaryType = "arraybuffer";
      // for outbound/browser client connections, use WebSocket interface directly:
      if (this.onopen)
        ws.onopen = this.onopen;
      if (this.onerror)
        ws.onerror = this.onerror;
      if (this.onclose)
        ws.onclose = this.onclose;
      if (this.onmessage)
        ws.onmessage = this.onmessage;
    }
    this.ws = ws;  // may be null
  }

}