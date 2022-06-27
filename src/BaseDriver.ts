import { AWebSocket, WebSocketDriver, DataBuf, pbMessage, WebSocketEventHandler, UpstreamDrivable, CLOSE_CODE, stime, className, PbParser } from "./types.js";

interface ListenerInfo {
  callback: EventListenerOrEventListenerObject;
  options: AddEventListenerOptions // {once? passive? capture?}
}
/** minimal implementation of EventTarget to power BaseDriver on Node.js */
class ServerSideEventTarget implements EventTarget {
  listeners: Record<string, Array<ListenerInfo>> = {}
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
    let tlist = this.listeners[type]
    if (!tlist) this.listeners[type] = tlist = []
    if ((typeof (options) == 'boolean')) options = { capture: options }
    tlist.push({callback: listener, options: options || {}}) // TODO: if options.once then wrap it with self-removal
  }
  dispatchEvent(event: Event): boolean {
    let tlist = this.listeners[event.type]
    if (!tlist) return true
    tlist.forEach(lis => {
      if (typeof(lis.callback) == 'function' ) {
        lis.callback.call(this, event)
      }
    })
    event.cancelable, event.defaultPrevented
    return (event.cancelable == false || event.defaultPrevented == false) // so: 'true' mostly
  }
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
    let tlist = this.listeners[type]
    if (!tlist) return
    if (!(typeof (options) == 'object')) options = { capture: options }
    let same = (lis: ListenerInfo) => { return (lis.callback == callback) && (lis.options.capture == (options as EventListenerOptions).capture)}
    this.listeners[type] = tlist.filter(lis => !same(lis))
  }
}
/**
 * Stackable drivers to move pbMessages up/down from/to websocket.
 * I (INNER) is closer to the websocket, aka downstream; bottom of stack
 * O (OUTER) is closer to the application, aka upstream; top of of stack
 * 
 */
export class BaseDriver<I extends pbMessage, O extends pbMessage> implements WebSocketDriver<I, O>, EventTarget, PbParser<I> {
  dnstream: UpstreamDrivable<I>;      // next driver downstream
  upstream: WebSocketEventHandler<O>; // next driver upstream
  log: boolean = false

  newMessageEvent(data: DataBuf<I>): MessageEvent {
    try {
      return new MessageEvent('message', {data: data})
    } catch {
      return {type: 'message', data: data} as MessageEvent
    }
  }
  isBrowser: boolean = (typeof window !== 'undefined')
  newEventTarget(): EventTarget {
    if (this.isBrowser) {
      return new EventTarget()           // works in browser
    } else {
      return new ServerSideEventTarget() // my impl on nodejs
    }
  }
  et: EventTarget = this.newEventTarget()
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
    this.et.addEventListener(type, listener, options)
  }
  // (event: CustomEvent)
  dispatchEvent(event: Event): boolean {
    if (!(event.target == null || event.target == undefined)) {
      event = (event.type == 'message') 
        ? this.newMessageEvent((event as MessageEvent).data) 
        : new Event(event.type, event)
    }
    return this.et.dispatchEvent(event) // redispatch an already dispatched event!
  }
  removeEventListener(type: string, callback: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
    this.et.removeEventListener(type, callback, options)
  }
  /** Connect to downstream Driver & tell it to connectUpStream to us.  
   * this.dnstream = dnstream; dnstream.upstream = this
   */
  connectDnStream(dnstream: UpstreamDrivable<I>): this {
    dnstream.connectUpStream(this)
    this.dnstream = dnstream;
    return this;
  }
  /** Connect to upstream driver:  
   * send open/error/close/wsmessage events to upstream.
   * 
   * Typically override wsmessage(data\<O>) to parseEval(deserialize(data\<O>))  
   * which may upstream.wsmessage(msg_data\<I>)
   * @param upstream
   */
  connectUpStream(upstream: WebSocketEventHandler<O>): void {
    this.upstream = upstream
  }
  /** invoke upstream.onopen(ev) */
  onopen(ev: Event): void {
    this.log && console.log(stime(this, ".onopen:"), `upstream.onopen(ev=${ev.type}), upstream=${className(this.upstream)}`)
    if (!!this.upstream) this.upstream.onopen(ev)
    this.dispatchEvent(ev)
  };
  /** invoke upstream.onerror(ev) */
  onerror(ev: Event): void {
    this.log && console.log(stime(this, ".onerror:"), `upstream.onerror(ev=${ev.type}), upstream=${className(this.upstream)}`)
    if (!!this.upstream) this.upstream.onerror(ev)
    this.dispatchEvent(ev)
  };
  /** invoke upstream.onclose(ev) */
  onclose(ev: CloseEvent): void {
    this.log && console.log(stime(this, ".onclose:"), `upstream.onclose(ev=${ev.type}), upstream=${className(this.upstream)}`)
    if (!!this.upstream) this.upstream.onclose(ev)
    this.dispatchEvent(ev)
  };
  /** invoke this.wsmessage(ev.data) */
  onmessage(ev: MessageEvent<DataBuf<I>>): void {
    this.log && console.log(stime(this, ".onmessage:"), `this.wsmessage(ev=${ev.type}), upstream=${className(this.upstream)}`)
    //this.dispatchEvent(ev)  // 'message' listener is reserved for wsmessage(DataBuf)
    this.wsmessage(ev.data)   // extract DataBuf<I> & use wsmessage()
  };
  /**
   * process message from downstream:
   * this.dispatchMessageEvent(data)
   * 
   * Probably want to override:  
   * this.parseEval(this.deserialize(data))
   * @param data DataBuf\<I> from the up-coming event
   */
  wsmessage(data: DataBuf<I>, wrapper?: pbMessage): void {
    this.log && console.log(stime(this, `.wsmessage: data, wrapper =`), {data, wrapper})
    this.dispatchMessageEvent(data)
  };
  /**
   * Deliver MessageEvent(data) to 'message' listeners: {type: 'message', data: data}.
   * @param data
   */
  dispatchMessageEvent(data: DataBuf<I>) {
    let event = this.newMessageEvent(data)
    this.log && console.log(stime(this, `.dispatchMessageEvent: data, event =`), {data, event})
    this.dispatchEvent(event) // accessing only ev.type == 'message' & ev.data;
  }

  /** convert DataBuf\<I\> to pbMessage
   * @abstract derived classes must override 
   */
  deserialize(data: DataBuf<I>): I {
    throw new Error(`Method not implemented: deserialize(${data})`);
  }

  /** Execute the semantic actions of the pbMessage: I
   * 
   * typically: this[\`eval_${message.msgType}\`].call(this, message, ...args)
   * @param message from deserialized DataBuf\<I\> (from dnstream)
   * @abstract derived classes must override 
   */
  parseEval(message: I, ...args: any): void {
    throw new Error(`Method not implemented: parseEval(${message})`);
  }

  /** Process data from upstream by passing it dnstream. */
  sendBuffer(data: DataBuf<O>): void {
    this.dnstream.sendBuffer(data)
  }
  /** Process close request by sending it dnstream */
  closeStream(code: CLOSE_CODE = CLOSE_CODE.NormalClosure, reason = 'normal'): void {
    this.dnstream.closeStream(code, reason)
  }
}

export type AnyWSD = WebSocketDriver<pbMessage, pbMessage>

/**
 * Bottom of the websocket driver stack: connect actual WebSocket.
 * 
 * Send & Recieve messages over a given WebSocket.
 */
export class WebSocketBase<I extends pbMessage, O extends pbMessage> 
  extends BaseDriver<I, O> {
  ws: AWebSocket;

  /** 
   * Stack the given drivers on top of this WebSocketBase, then connectWebSocket(ws|url) 
   * 
   * TODO: is there a Generic Type for the chain of drivers (COD)?
   * 
   * COD\<I extends pbMessage, O extends pbMessage> = d0\<I,X0>, d1\<X0,X1>, d2\<X1,X2 extends O>
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
   * Connect to Downstream 'Driver'; BaseDriver connects directly to AWebSocket [or URL->new WebSocket()].
   * @param ws_or_url existing AWebSocket or string -> new WebSocket() [on Browser]
   * @returns this WebSocketBase
   * @override to accept AWebSocket | string
   */
  override connectDnStream(ws_or_url: AWebSocket | string | UpstreamDrivable<O>): this {
    return this.connectWebSocket(ws_or_url as AWebSocket | string )
  }
  /** Implements connectDnStream(WebSocketDriver) -> connect to WebSocket|url.
   * @param ws the WebSocket (or url) connection to be handled. (or null)
   * Can also be a SocketSender (ie another CnxHandler)
   */
  connectWebSocket(ws: AWebSocket | string): this {
    if (typeof (ws) === 'string') {
      let url = ws;
      ws = new WebSocket(url); // TODO: handle failure of URL or connection
      ws.binaryType = "arraybuffer";
      // for outbound/browser client connections, use WebSocket interface directly:
      // tell [downstream] WebSocket to invoke [upstream] BaseDriver handlers:
      // this [essentially/actually] adds our methods as EventListener('type')
    }
    if (!!ws ) { // (ws instanceof WebSocket) hangs!
      // pull events from downstream [WebSocket] and push up to this Driver
      ws.onopen = (ev) => this.onopen(ev);
      ws.onerror = (err) => this.onerror(err);
      ws.onclose = (ev) => this.onclose(ev);
      ws.onmessage = (ev) => this.onmessage(ev);
    }
    this.ws = ws;  // may be null
    return this
  }

  /**
   * Incoming message from dnstream.
   * @param data DataBuf containing \<I extends pbMessage>
   * @param wrapper [unlikely to come from dnstream to this WebSocketBase]
   * @override BaseDriver
   */
  override wsmessage(data: DataBuf<I>, wrapper?: pbMessage): void {
    super.wsmessage(data)
    //console.log(stime(this, ".wsmesssage"), `upstream.wsmessage(${data.byteLength}), upstream=`, className(this.upstream))
    if (!!this.upstream) this.upstream.wsmessage(data, wrapper)
  };

  /** process data from upstream by passing it downsteam. */
  override sendBuffer(data: DataBuf<O>): void {
    this.ws.send(data)
  }

  /** invoke WebSocket.close(code, reason) */
  override closeStream(code?: CLOSE_CODE, reason?: string): void {
    // close always legal, should not fail [altho: close on a Closed/Closing stream?]
    this.ws?.close(code, reason) // invoke libdom interface to WebSocket; AWebSocket -> wsWebSocket implements
  }

}