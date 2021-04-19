import type { AWebSocket, WebSocketDriver, DataBuf, pbMessage, WebSocketEventHandler, UpstreamDrivable, CLOSE_CODE } from "./types";

/**
 * Stack drivers above a websocket.
 * I (INNER) is closer to the websocket, aka downstream
 * O (OUTER) is closer to the application, aka upstream
 * 
 */
export class BaseDriver<I extends pbMessage, O extends pbMessage> implements WebSocketDriver<I, O> {
  dnstream: UpstreamDrivable<I>;      // next driver downstream
  upstream: WebSocketEventHandler<O>; // next driver upstream

  connectToStream(dnstream: UpstreamDrivable<I>): this {
    dnstream.connect(this)
    this.dnstream = dnstream;
    return this;
  }
  /** Add the upstream driver. */
  connect(upstream: WebSocketEventHandler<O>): void {
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
  wsmessage(data: DataBuf<I>): void {
    if (!!this.upstream) this.upstream.wsmessage(data)
  };

  deserialize(bytes: Uint8Array): I {
    throw new Error("Method not implemented.");
  }

  parseEval(message: I, ...args: any): void {
    throw new Error("Method not implemented.");
  }

  /** process data from upstream by passing it downsteam. */
  sendBuffer(data: DataBuf<O>, ecb?: (error: Event | Error) => void): void {
    this.dnstream.sendBuffer(data)
  }
  /** process close by sending it upstream */
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.dnstream.closeStream(code, reason)
  }
}

type WSD<I extends pbMessage, O extends pbMessage> = WebSocketDriver<I,O>
type AnyWSD = WSD<pbMessage, pbMessage>

/**
 * Bottom of the websocket driver stack: connect actual WebSocket.
 * Send & Recieve messages over a WebSocket.
 */
export class WebSocketBase<I extends pbMessage, O extends pbMessage> 
  extends BaseDriver<I, O> {
  ws: AWebSocket;

  /** 
   * stack the given drivers on top of this WebSocketBase 
   * 
   * TODO: is there a Generic Type for the chain of drivers?
   * 
   * COD<I extends pbMessage, O extends pbMessage> = d0<I,X0>, d1<X0,X1>, d2<X1,X2 extends O>
   */
  //connectStream(ws: WebSocket | string, ...drivers: Array<{ new (): WebSocketDriver<any,any>}> ): WebSocketDriver<any, any> {
  connectStream(ws: WebSocket | string, ...drivers: Array<{ new (): AnyWSD}> ): AnyWSD {
    let wsb = this
    let top = wsb as AnyWSD
    drivers.forEach(d => { top = new d().connectToStream(top)} )
    wsb.connectws(ws)
    return top
  }
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
  onmessage(ev: MessageEvent<DataBuf<I>>): void {
    this.wsmessage(ev.data)
  };

  /** process data from upstream by passing it downsteam. */
  sendBuffer(data: DataBuf<O>, ecb?: (error: Event | Error) => void): void {
    this.ws.send(data)
  }

  /** invoke WebSocket.close() */
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.ws.close(code, reason)
  }

}