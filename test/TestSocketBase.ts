import { wsWebSocket } from '../test/wsWebSocket'
import { stime, EzPromise, pbMessage, AWebSocket, WebSocketBase, CloseInfo, close_fail, normalClose, readyState, CgType, CgMessage, DataBuf } from '../src'

/**
 * A WebSocketBase that uses wsWebSocket for a WebSocket.
 * 
 * Suitable for node.js/jest when testing without a browser WebSocket.
 */
export class TestSocketBase<I extends pbMessage, O extends pbMessage> extends WebSocketBase<I, O> {
  // for jest/node: make a wsWebSocket(url), send messages upstream
  url: string

  /** fulfill the given EzPromises when webSocket is OPEN or CLOSE. */
  connectWebSocket(ws: AWebSocket | string, openP?: EzPromise<AWebSocket>, closeP?: EzPromise<CloseInfo>) {
    if (typeof (ws) === 'string') {
      let url: string = this.url = ws;
      console.log(stime(this, `.connectWebSocket: url=`), url)
      ws = new wsWebSocket(url); // TODO: handle failure of URL or connection
    }
    super.connectWebSocket(ws)

    this.ws.addEventListener('error', (ev: Event) => {
      console.log(stime(this, " ws error:"), ev)
      !!closeP && closeP.fulfill(close_fail)
    })

    this.ws.addEventListener('open', () => {
      console.log(stime(this, " ws open:"), !!openP ? "   openP.fulfill(ws)" : "    no Promise")
      !!openP && openP.fulfill(this.ws)
    })

    this.ws.addEventListener('close', (ev: CloseEvent) => {
      console.log(stime(this, " ws close:"), { readyState: readyState(this.ws), reason: ev.reason })
      !!closeP && closeP.fulfill(normalClose(ev.reason))
    })
  }
  /** return this.on('message', handle, {once: true}) */
  listenFor(type: CgType, handle: (msg: CgMessage)=>void = (msg)=>{}): EventListener {
    let listener = (ev: Event) => {
      let data = (ev as MessageEvent).data as DataBuf<CgMessage>
      let cgm = CgMessage.deserialize(data)
      let outObj = cgm.outObject()
      console.log(stime(this, `.listenFor(${CgType[type]})`), outObj)
      if (cgm.type === type) {
        this.removeEventListener('message', listener)
        handle(cgm)
      }
    }
    this.addEventListener('message', listener)
    return listener
  }
}