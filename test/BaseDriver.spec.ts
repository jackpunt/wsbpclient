import { WebSocketBase } from '../src/BaseDriver'
import { DataBuf, stime, EzPromise, pbMessage, CLOSE_CODE, AWebSocket} from '../src/types'
import { CgClient } from '../src/CgClient'
import { CgMessage, CgType } from '../src/CgProto'
import type { AckPromise } from '../src/CgBase'
import { wsWebSocket, ws } from './wsWebSocket'

var readyState = (ws: WebSocket): string => {
  return ["CONNECTING" , "OPEN" , "CLOSING" , "CLOSED"][ws.readyState]
}
var testTimeout = 3000;

const echourl = "wss://game7.thegraid.com:8443"
const cgservurl = "wss://game7.thegraid.com:8444"
const testurl = cgservurl;
/**
 * A WebSocketBase that uses wsWebSocket for a WebSocket.
 * 
 * Suitable for jest/node.js while testing without a browser WebSocket.
 */
class TestSocketBase<I extends pbMessage, O extends pbMessage> extends WebSocketBase<I, O> {
  // for jest/node: make a wsWebSocket(url), send messages upstream
  url: string
  cnx_time = 1000;

  connectWebSocket(ws: AWebSocket | string, openP?: EzPromise<AWebSocket>, closeP?: EzPromise<CloseInfo>) {
    if (typeof (ws) === 'string') {
      let url: string = this.url = ws;
      ws = new wsWebSocket(url); // TODO: handle failure of URL or connection
    }
    super.connectWebSocket(ws)
    // there are no DOM Events for ws.onmessage(Event), so get invocation from this.wss:
    // fwd message.data from wss<wsWebSocket> to BaseDriver:
    this.wss.onmessage = (ev: ws.MessageEvent) => {
      this.wsmessage(ev.data as Buffer) // assert wss.binaryType === 'arraybuffer'
    }

    this.ws.addEventListener('error', (ev: Event) => {
      console.log(stime(), "ws error:", ev)
      closeP.fulfill(close_fail)
    })

    this.ws.addEventListener('open', () => {
      console.log(stime(), "ws connected & open!   openP.fulfill(ws)")
      openP.fulfill(this.ws)
      setTimeout(() => {
        console.log(stime(), 'Ok to Close: fulfill("timeout") = ', this.cnx_time)
        okToClose.fulfill("timeout")
      }, this.cnx_time)
    })
  }
  /** the wrapped ws$WebSocket: ws.WebSocket */
  get wss() { return (this.ws as wsWebSocket).wss  }
}

class TestCgClient<O extends pbMessage> extends CgClient<O> {
  // wsmessage(data: DataBuf<O>) {
  //   console.log(stime(), "TestCgClient.wsmessage data=", data)
  //   super.wsmessage(data)
  // }
  msgPromiseByType: Record<string, AckPromise> = {}
  sendToSocket(message: CgMessage): AckPromise {
    let rv = super.sendToSocket(message)
    this.msgPromiseByType[message.type] = rv // holds the LATEST AckPromise, for each message.type
    return rv
  }
  eval_ack(ack: CgMessage, req: CgMessage) {
    console.log(stime(), "eval_ack:", {ack, req})
    super.eval_ack(ack, req)
  }
}

var pwsbase = new EzPromise<TestSocketBase<pbMessage, pbMessage>>()
var wsbase = new TestSocketBase<pbMessage, pbMessage>()

test("WebSocketBase.construct & connectws", () => {
  expect(wsbase).toBeInstanceOf(WebSocketBase)
  console.log(stime(), "try connect to echourl", testurl)
  wsbase.connectWebSocket(testurl, openP, closeP)
  expect(wsbase.ws).toBeInstanceOf(wsWebSocket)
  console.log(stime(), "pwsbase.fulfill(wsbase)", readyState(wsbase.ws))
  pwsbase.fulfill(wsbase)
  setTimeout(() => openP.reject("timeout"), 500); // is moot if alaready connected
})

var openP = new EzPromise<AWebSocket>()
openP.catch((rej) => { console.log(stime(), "cnxP.catch", rej) })

var okToClose = new EzPromise<string>()

test("WebSocket connected & OPEN", () => {
  return openP.then((ws) => {
    expect(ws).toBeInstanceOf(wsWebSocket)
    expect(ws.readyState).toBe(ws.OPEN);
  }, (rej) => {
    console.log("WebSocket connection rejected", rej)
    okToClose.fulfill("no websocket connection")
    fail(rej)
    //expect(rej).toBe("timeout") // never reached !! 
  })
})

var pMsgsSent = new EzPromise<AckPromise>()
var group_name = "test_group"
var client_id = 1
var pMsg0: AckPromise // from send_join
var pMsg1: AckPromise // from send_ack (resolved && value === undefined)

var cgclient: CgClient<pbMessage> = new TestCgClient();
test("CgClient.connectDnStream", () => {
  return pwsbase.finally(() => {
    console.log(stime(), "try cgclient.connectDnStream")
    cgclient.connectDnStream(wsbase)
    expect(cgclient.dnstream).toBe(wsbase)
    expect(wsbase.upstream).toBe(cgclient)
    pMsg0 = cgclient.send_join(group_name, 1, "passcode1")
    pMsg1 = cgclient.sendAck("joined", {client_id: 1, group: group_name})
    //console.log("send messages: pMsg0=", pMsg0, "pMsg1=", pMsg1)
    pMsgsSent.fulfill(pMsg0)
  })
})

test("wss.message received", done => {
  pwsbase.then((wsbase) => {
    let nth = 0;
    // for logging advice only; no semantic effect
    wsbase.ws.addEventListener("message", function(this: WebSocket, ev: MessageEvent<ArrayBuffer>) {
      expect(ev.data).toBeInstanceOf(ArrayBuffer)
      let data = ev.data as DataBuf<CgMessage>
      let cgm = CgMessage.deserialize(data)
      console.log(stime(), "wss.message received", cgm.cgType, ++nth, cgm)
      expect([CgType.join, CgType.ack]).toContain(cgm.type) // in that order...
      done()
    })
  })
})

test("CgClient.send_join acked", () => {
  // completes when pMsg1 is echoed back to us.
  return pMsgsSent.then((pMsg) => {
    //console.log("send_join acked: pMsg0=", pMsg0, "pMsg1=", pMsg1, "pMsg=", pMsg)
    pMsg0.then((ack_msg_rcvd) => {
      // client_id fails on second run: we didn't leave, and socket drop does not auto-leave!
      expect(ack_msg_rcvd).toEqual(pMsg1.message) // presumably via serialize/deserialize
      expect(ack_msg_rcvd.success).toBe(true)
      expect(cgclient.group_name).toBe(group_name)
      expect(cgclient.client_id).toBe(client_id)
      expect(cgclient.isClient0()).toBeFalsy()
    })
  })
})




type CloseInfo = { code: number, reason: string }
var close_normal: CloseInfo = {code: CLOSE_CODE.NormalCLosure, reason: "test done" }
var close_fail: CloseInfo = { code: CLOSE_CODE.Empty, reason: "failed"}
/** Promise filled({code, reason}) when socket is closed. */
var closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
closeP.catch((reason) => { console.log(stime(), "closeP-catch:", reason) })

describe("Closing", () => {
  test("BaseDriver.close client", () => {
    return okToClose.finally(() => {
      console.log(stime(), "try close client:", okToClose.value)
      wsbase.ws.addEventListener("close", (ev) => {
        console.log(stime(), "closeStream:", readyState(wsbase.ws), ev.reason)
        closeP.fulfill(close_normal)
      })
      try {
        wsbase.closeStream(close_normal.code, close_normal.reason)
      } catch (err) {
        console.log(stime(), "closeStream error:", err)
        closeP.fulfill(close_fail)
      }
    })
  })

  test("BaseDriver.client closed", done => {
    closeP.then((info: CloseInfo) => {
      let { code, reason } = info
      console.log(stime(), "client closed:", info, readyState(wsbase.ws))
      if (code == close_fail.code) {
        expect(reason).toBe(close_fail.reason)
      } else {
        expect(code).toBe(close_normal.code)
        expect(reason || close_normal.reason).toBe(close_normal.reason)
      }
      done()
    },
      (rej: any) => {
        expect(rej).toBe(close_fail.reason)
        done()
      })
  }, testTimeout)

  test("BaseDriver.verify closed", done => {
    closeP.finally(() => {
      expect(wsbase.ws.readyState === wsbase.ws.CLOSED)
      setTimeout(() => done(), 100)
    })
  })
})