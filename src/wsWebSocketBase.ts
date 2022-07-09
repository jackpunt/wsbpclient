import { stime } from '@thegraid/common-lib'
import type { EzPromise } from '@thegraid/ezpromise'
import type { WebSocket as ws$WebSocket } from "ws"

import { AnyWSD, AWebSocket, CgClient, CgMessage, CgType, CloseInfo, close_fail, DataBuf, normalClose, pbMessage, readyState, WebSocketBase } from './index.js'
import { wsWebSocket } from './wsWebSocket.js'

// https://www.npmjs.com/package/mock-socket (presumagly is *just* a mock, does not connect to anything)
// OR: jsdom (which has ws/WebSocket, but also all of window, DOM, browser stuff)
/**
 * A WebSocketBase Driver that uses a [nodejs-compatible] wsWebSocket (our minimal adapter)
 * 
 * Suitable for node.js/jest when testing CLIENT without a BROWSER WebSocket.
 * 
 * A SERVER WebSocketBase (for Nodejs) is provided in wspbserver: ServerSocketDriver.ts
 */
export class wsWebSocketBase<I extends pbMessage, O extends pbMessage> extends WebSocketBase<I, O> {
  // for jest/node: make a wsWebSocket(url), send messages upstream
  url: string
  /** this.ws socket state: { readyState: string, closed: number, closeEmitted: number } 
   * when debugging why jest could not close... look at internal state of ws WebSocket
   */
  get closeState() {
    if (!this.ws) return {}
    let wss: ws$WebSocket  = this.ws['wss'] // *could* be a jsdom WebSocket: no, use normal WebSocketBase in that case
    let state = readyState(this.ws), socket = wss['_socket'], recvr = wss['_receiver'], sendr = wss['_sender']
    if (!socket) return { readyState: state }
    let sockRstate = socket['_readableState']
    let sockWstate = socket['_writableState']
    let recvWstate = (recvr && recvr['_writeableState']) || { closeEmitted: 'unknown', errorEmited: 'unknown'}
    let sendWState = (sendr && sendr['_writeableState']) || { closeEmitted: 'unknown', errorEmited: 'unknown'}
    //return { readyState: state, closedR: sockRstate['closed'], closeEmittedR: sockRstate['closeEmitted'], closedW: sockWstate['closed'], closeEmittedW: sockWstate['closeEmitted'] }
    return { readyState: state }
  }
  /** 
   * extend connectWebSocket to fulfill the given EzPromises when webSocket is OPEN or CLOSE. 
   * @param ws existing WebSocket or URL string to open wsWebSocket(url)
   * @param openP fulfilled(AWebSocket) when WebSocket is opened
   * @param closeP fulfilled(CloseInfo) when WebSocket is closed
   */
  override connectWebSocket(ws: AWebSocket | string, openP?: EzPromise<AWebSocket>, closeP?: EzPromise<CloseInfo>) {
    if (typeof (ws) === 'string') {
      let url: string = this.url = ws;
      this.ll(1) && console.log(stime(this, `.connectWebSocket: url=`), url)
      ws = new wsWebSocket(url); // TODO: handle failure of URL or connection
    }
    super.connectWebSocket(ws)

    this.ws.addEventListener('error', (ev: ErrorEvent) => {
      this.ll(1) && console.log(stime(this, " ws_error:"), ev.message)
      !!closeP && closeP.fulfill(close_fail)
    })

    this.ws.addEventListener('open', (ev: Event) => {
      this.ll(1) && console.log(stime(this, " ws_open:"), !!openP ? "   openP.fulfill(ws)" : "    no Promise")
      !!openP && openP.fulfill(this.ws)
    })

    this.ws.addEventListener('close', (ev: CloseEvent) => {
      this.ll(1) && console.log(stime(this, " ws_close:"), { readyState: readyState(this.ws), reason: ev.reason, closeP : !!closeP })
      !!closeP && closeP.fulfill(normalClose(ev.reason))
    })
    return this
  }
  /** return this.on('message', handle, {once: true}) */
  listenFor(type: CgType, handle: (msg: CgMessage)=>void = (msg)=>{}): EventListener {
    let listener = (ev: Event) => {
      let data = (ev as MessageEvent).data as DataBuf<CgMessage>
      let cgm = CgMessage.deserialize(data)
      this.ll(1) && console.log(stime(this, `.listenFor(${CgType[type]})`), cgm.msgObject(true))
      if (cgm.type === type) {
        this.removeEventListener('message', listener)
        handle(cgm)
      }
    }
    this.addEventListener('message', listener)
    return listener
  }
}

/** CgClient to Log and Ack msgs recv'd; log .onLeave() */
export class TestCgClient<O extends CgMessage> extends CgClient<O> implements AnyWSD {
  override eval_send(message: CgMessage) {
    let inner_msg = CgMessage.deserialize(message.msg)
    this.ll(1) && console.log(stime(this, `.eval_send[${this.client_id}]`), inner_msg.msgObject(true))
    this.sendAck(`send-rcvd-${this.client_id}`, {client_id: message.client_from})
  }

  /** when send_leave has been sent, typically: closeStream */
  override leaveClose(reason: string) {
    //override CgBase so client does not auto-close the stream
    this.ll(1) && console.log(stime(this, `.leaveClose [${this.client_id}]`), reason )
    if (this.client_id !== 0) return
    super.leaveClose(reason) // if last client leaving: close referee (??)
  }
}
/** TestCgClient extended for role of Referee: sends Ack/Nak */
export class TestCgClientR<O extends CgMessage> extends TestCgClient<O> {
  override eval_send(message: CgMessage) {
    this.ll(1) && console.log(stime(this, `.eval_send[${message.client_from} -> ${this.client_id}]`), this.innerMessageString(message))
    let inner_msg = CgMessage.deserialize(message.msg) // inner CgMessage, type==CgType.none
    if (inner_msg.type === CgType.none && inner_msg.cause == "NakMe") {
      this.sendNak(inner_msg.cause, { client_id: message.client_from })
      return
    }
    if (inner_msg.type === CgType.none && inner_msg.cause == "MsgInAck") {
      this.ll(1) && console.log(stime(this, `.eval_send[${this.client_id}]`), "Augment MsgInAck")
      inner_msg.info = inner_msg.cause   // augment inner 'none' message: info: "MsgInAck"
      let aug_msg = inner_msg.serializeBinary()  // prep 'none' message to insert into original 'send'
      message.msg = aug_msg
      message.info = "send(aug_none)"
      let aug_send = message.serializeBinary() // augment & re-serialize original CgMessage({type: CgType.send}, ...)
      let pAck = this.sendAck(inner_msg.cause, { client_id: message.client_from, msg: aug_send })
      this.ll(1) && console.log(stime(this, `.eval_send returning Ack=`), pAck.message.msgObject(true))
      return
    }
    this.sendAck("send-approved", {client_id: message.client_from})
  }
}
