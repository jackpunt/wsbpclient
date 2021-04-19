import type { AWebSocket, WebSocketDriver, DataBuf, pbMessage, WebSocketEventHandler, UpstreamDrivable, CLOSE_CODE } from "./types";

/**
 * Stack drivers above a websocket.
 * INNER is closer to the websocket, aka downstream
 * OUTER is closer to the application, aka upstream
 * 
 */
export class BaseDriver<INNER extends pbMessage, OUTER extends pbMessage> implements WebSocketDriver<INNER, OUTER> {
  dnstream: UpstreamDrivable<INNER>;      // next driver downstream
  upstream: WebSocketEventHandler<OUTER>; // next driver upstream

  connectToStream(dnstream: UpstreamDrivable<INNER>) {
    dnstream.connect(this)
    this.dnstream = dnstream;
  }
  /** Add the upstream driver. */
  connect(upstream: WebSocketEventHandler<OUTER>): void {
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

  /**
   * process message from downstream
   * OVERRIDE ME!
   * 
   * default: passing it directly upstream!  
   */
  wsmessage(data: DataBuf<INNER>): void {
    if (!!this.upstream) this.upstream.wsmessage(data)
  };

  deserialize(bytes: Uint8Array): INNER {
    throw new Error("Method not implemented.");
  }

  parseEval(message: INNER, ...args: any): void {
    throw new Error("Method not implemented.");
  }

  /** process data from upstream by passing it downsteam. */
  sendBuffer(data: DataBuf<OUTER>, ecb?: (error: Event | Error) => void): void {
    this.dnstream.sendBuffer(data)
  }
  /** process close by sending it upstream */
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.dnstream.closeStream(code, reason)
  }
}

/**
 * Bottom of the websocket driver stack: connect actual WebSocket.
 * Send & Recieve messages over a WebSocket.
 */
export class WebSocketBase<INNER extends pbMessage, OUTER extends pbMessage> 
  extends BaseDriver<INNER, OUTER> {
  ws: AWebSocket;

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

  /** process message from socket: pass it upstream. */  
  onmessage(ev: MessageEvent<DataBuf<INNER>>): void {
    this.wsmessage(ev.data)
  };

  /** process data from upstream by passing it downsteam. */
  sendBuffer(data: DataBuf<OUTER>, ecb?: (error: Event | Error) => void): void {
    this.ws.send(data)
  }

  /** invoke WebSocket.close() */
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.ws.close(code, reason)
  }

}