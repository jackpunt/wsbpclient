import { AWebSocket, WebSocketDriver, DataBuf, pbMessage, WebSocketEventHandler, UpstreamDrivable, CLOSE_CODE, stime } from "./types";

/**
 * Stackable drivers to move pbMessages up/down from/to websocket.
 * I (INNER) is closer to the websocket, aka downstream
 * O (OUTER) is closer to the application, aka upstream
 * 
 */
export class BaseDriver<I extends pbMessage, O extends pbMessage> implements WebSocketDriver<I, O> {
  dnstream: UpstreamDrivable<I>;      // next driver downstream
  upstream: WebSocketEventHandler<O>; // next driver upstream

  /** Connect to downstream Driver & tell it to connectUpStream to us.  
   * this.dnstream = dnstream; dnstream.upstream = this
   */
  connectDnStream(dnstream: UpstreamDrivable<I>): this {
    dnstream.connectUpStream(this)
    this.dnstream = dnstream;
    return this;
  }
  /** Connect to upstream driver: 
   * <br>send open/error/close/wsmessage events to upstream.
   * 
   * Typically override wsmessage(data<O>) to parseEval(deserialize(data<O>))
   * <br>which may upstream.wsmessage(msg_data<I>)
   * @param upstream
   */
  connectUpStream(upstream: WebSocketEventHandler<O>): void {
    this.upstream = upstream
  }
  /** invoke upstream.onopen(ev) */
  onopen(ev: Event): void {
    console.log(stime(), "BaseDriver.onopen: upstream.onopen(ev)", this.upstream)
    if (!!this.upstream) this.upstream.onopen(ev)
  };
  /** invoke upstream.onerror(ev) */
  onerror(ev: Event): void {
    if (!!this.upstream) this.upstream.onerror(ev)
  };
  /** invoke upstream.onclose(ev) */
  onclose(ev: CloseEvent): void {
    console.log(stime(), "BaseDriver.onclose: upstream.onclose(ev)", this.upstream)
    if (!!this.upstream) this.upstream.onclose(ev)
  };
  /** invoke this.wsmessage(ev.data) */
  onmessage(ev: MessageEvent<DataBuf<I>>): void {
    console.log(stime(), "BaseDriver.onmessage: this.wsmessage(ev.data)", this.upstream)
    this.wsmessage(ev.data)
  };
  /**
   * process message from downstream
   * OVERRIDE ME!
   * 
   * default: this.upstream.wsmessage(data)  
   */
  wsmessage(data: DataBuf<I>): void {
    console.log(stime(), "BaseDriver.wsmessage: upstream.wsmessage(data)", this.upstream)
    if (!!this.upstream) this.upstream.wsmessage(data)
  };

  deserialize(bytes: Uint8Array): I {
    throw new Error("Method not implemented.");
  }

  parseEval(message: I, ...args: any): void {
    throw new Error("Method not implemented.");
  }

  /** process data from upstream by passing it downsteam. */
  sendBuffer(data: DataBuf<O>): void {
    this.dnstream.sendBuffer(data)
  }
  /** process close by sending it upstream */
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.dnstream.closeStream(code, reason)
  }
}

export type AnyWSD = WebSocketDriver<pbMessage, pbMessage>

/**
 * Bottom of the websocket driver stack: connect actual WebSocket.
 * 
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
  connectStream(ws: AWebSocket | string, ...drivers: Array<{ new (): AnyWSD}> ): AnyWSD[] {
    let wsb = this
    let stack: AnyWSD[] = [wsb]
    let top = wsb as AnyWSD
    drivers.forEach(d => { top = new d().connectDnStream(top); stack.push(top)} )
    wsb.connectWebSocket(ws)  // attach drivers *then* connect to URL
    return stack
  }

  /**
   * @param ws_or_url 
   * @returns this WebSocketBase
   * @override to accept AWebSocket | string
   */
  connectDnStream(ws_or_url: AWebSocket | string | UpstreamDrivable<O>): this {
    this.connectWebSocket(ws_or_url as AWebSocket | string )
    return this
  }
  /** replace the usual connectDnStream(WebSocketDriver) 
   * @param ws the WebSocket (or url) connection to be handled. (or null)
   * Can also be a SocketSender (ie another CnxHandler)
   * @param msg_handler optional override PbMessage handler; default: 'this'
  */
  connectWebSocket(ws: AWebSocket | string) {
    if (typeof (ws) === 'string') {
      let url = ws;
      ws = new WebSocket(url); // TODO: handle failure of URL or connection
      ws.binaryType = "arraybuffer";
      // for outbound/browser client connections, use WebSocket interface directly:
      // tell [downstream] WebSocket to invoke [upstream] BaseDriver handlers:
      // this [essentially/actually] adds our methods as EventListener('type')
    }
    if (!!ws ) { // (ws instanceof WebSocket) hangs!
      ws.onopen = (ev) => this.onopen(ev);
      ws.onerror = (err) => this.onerror(err);
      ws.onclose = (ev) => this.onclose(ev);
      ws.onmessage = (ev) => this.onmessage(ev);
    }
    this.ws = ws;  // may be null
  }

  /** process data from upstream by passing it downsteam. */
  sendBuffer(data: DataBuf<O>): void {
    this.ws.send(data)
  }

  /** invoke WebSocket.close() */
  closeStream(code: CLOSE_CODE, reason: string): void {
    this.ws.close(code, reason)
  }

}