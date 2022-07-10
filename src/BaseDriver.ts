import { AWebSocket, className, CLOSE_CODE, DataBuf, pbMessage, PbParser, READY_STATE, stime, UpstreamDrivable, WebSocketDriver, WebSocketEventHandler } from "./types.js";
import { json } from "@thegraid/common-lib"
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
 * 
 * **Note**: the 'O' messages are embedded inside the 'I' messages.. TODO: fix 
 * @I (INNER) the pbMessage THIS driver handles; this.derserialize(): I
 * @O (OUTER) the pbMessage of outer driver/app; upstream.deserialze(): O
 */
export class BaseDriver<I extends pbMessage, O extends pbMessage> implements WebSocketDriver<I, O>, EventTarget, PbParser<I> {
  dnstream: UpstreamDrivable<I>;      // next driver downstream
  upstream: WebSocketEventHandler<O>; // next driver upstream
  log: number = 0 // -1: No log, 0: minimal/useful log, 1: detail log, 2: extra log
  ll(l: number) { return this.log >= l }

  /** return WebSocketBase at bottom of stack. */
  get wsbase(): WebSocketBase<pbMessage,pbMessage> { 
    let dnstream = this.dnstream
    while ((dnstream instanceof BaseDriver) && !(dnstream instanceof WebSocketBase)) { dnstream = dnstream.dnstream }
    return (dnstream instanceof WebSocketBase) && (dnstream as WebSocketBase<pbMessage, pbMessage>)
  }
  /** this.wsbase?.ws?.readyState == OPEN */
  get wsOpen() { return this.wsbase?.ws?.readyState == READY_STATE.OPEN } // TODO does this really work?
  
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
  // upstreamDriver does not need to register for open/close/error/message events
  // open/close/error are forwarded upstream automatically; 
  // message is forwarded upstream with send_send(message.msg)

  /** Listener for dnstream 'open' event; invoke upstream.onopen(ev) */
  onopen(ev: Event): void {
    this.ll(1) && console.log(stime(this, ` BaseDriver.onopen:`), `upstream=${className(this.upstream)}.onopen()`)
    this.dispatchEvent(ev) // 'open'
    if (!!this.upstream) this.upstream.onopen(ev)
  };
  /** Listener for dnstream 'error' events;nvoke upstream.onerror(ev) */
  onerror(ev: ErrorEvent): void {
    this.ll(1) && console.log(stime(this, ` BaseDriver.onerror:`), `upstream=${className(this.upstream)}.onerror()`)
    this.dispatchEvent(ev) // 'error'
    if (!!this.upstream) this.upstream.onerror(ev)
  };
  /** listener for dnstream 'close' event; invoke upstream.onclose(ev) */
  onclose(ev: CloseEvent): void {
    this.ll(1) && console.log(stime(this, ` BaseDriver.onclose:`), `upstream=${className(this.upstream)}.onclose()`)
    this.dispatchEvent(ev) // 'close'
    if (!!this.upstream) this.upstream.onclose(ev)
  };
  /** 
   * BaseDriver Listener for Message Data.
   * - logData(data)
   * 
   * _Implicit_ Listener: this.wsmessage(data, wrapper) => this.onmessage(data); 
   * when: this.dispatchMessageEvent(data); then also this.onmessage(data)
   * - typically do not register explicit 'message' listener
   * - typically do not register for 'message' [wrapper] from dnstream
   * 
   * Typically override to:  
   *  { this.parseEval(this.deserialize(data)) }
   */
  onmessage(data: DataBuf<I>): void {
    this.ll(1) && console.log(stime(this, ` BaseDriver.wsmessage:`), this.logData(data))
  };
  /**
   * BaseDriver hander for (data: DataBuf<I>) from dnstream.
   * - save this.wrapper = wrapper [may be undefined]
   * - invoke this.dispatchMessageEvent(data)
   * - invoke this.onmessage(data)
   * @param data DataBuf\<I> from the up-coming event
   * @param wrapper the encapsulating pbMessage, if dnstream.send(wrapper.msg\<I>)
   */
  wsmessage(data: DataBuf<I>, wrapper?: pbMessage): void {
    this.wrapper = wrapper
    this.dispatchMessageEvent(data)  // TODO: before or after onmessage?
    this.onmessage(data)             // last/implict 'listener' for ev.data
  };
  /** wrapper for the latest wsmessage(data) received (or undefined if no wrapper supplied) */
  wrapper: pbMessage

  stringData(data: DataBuf<I>) {
    let k = new Uint8Array(data).filter(v => v >= 32 && v <= 126)
    return String.fromCharCode(...k)
  }
  logData(data: DataBuf<I>): {} | string {
    let str = this.stringData(data)
    let msg = this.deserialize(data)
    if (!msg) return {data, str}
    let msgType = (msg as any)?.msgType // msgType may be undefined 
    return { data, str, msgType, msg: this.msgToString(msg) }
  }
  /** convert message to useful string for logging. json(message.toObject()) */
  msgToString(message: I) {
    return json(message?.toObject())
  }
  /**
   * Deliver MessageEvent(data) to 'message' listeners: {type: 'message', data: data}.
   * @param data
   * @param logLevel = 2; set lower if you want to see more!
   */
  dispatchMessageEvent(data: DataBuf<I>, ll = 2) {
    this.ll(2) && console.log(stime(this, ` BaseDriver.dispatchMessageEvent: data =`), data)
    this.dispatchEvent(this.newMessageEvent(data)) // other listeners... [unlikely]
  }

  /** convert DataBuf\<I\> to pbMessage
   * @abstract derived classes must override 
   */
  deserialize(data: DataBuf<I>): I {
    return undefined
    //throw new Error(`Method not implemented: deserialize(${data})`);
  }

  /** 
   * BaseDriver: Execute the semantic actions of the pbMessage: I
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
      ws.addEventListener('open', (ev: Event) => this.onopen(ev))
      ws.addEventListener('close', (ev: CloseEvent) => this.onclose(ev))
      ws.addEventListener('error', (ev: ErrorEvent) => this.onerror(ev))
      ws.addEventListener('message', (ev: MessageEvent) => this.wsmessage(ev.data)) // from WebSocketBase
    }
    this.ws = ws;  // may be null
    return this
  }

  /**
   * Forward data from WebSocket to upstream driver: 
   * Every message(DataBuf<I>) is an implicit send_send(DataBuf<O>)
   * @param data DataBuf containing \<I extends pbMessage>
   * @override BaseDriver
   */
  override onmessage(data: DataBuf<I>): void {
    super.onmessage(data) // logData(data)
    if (!!this.upstream) this.upstream.wsmessage(data) // from WebSocketBase
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