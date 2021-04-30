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

const echourl: string = "wss://game7.thegraid.com:8443"
const cgservurl: string = "wss://game7.thegraid.com:8444"
const testurl: string = cgservurl;

const echoserver:boolean = (testurl == echourl)
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
      console.log(stime(this, "ws error:"), ev)
      closeP.fulfill(close_fail)
    })

    this.ws.addEventListener('open', () => {
      console.log(stime(this, "ws connected & open!"), "   openP.fulfill(ws)")
      openP.fulfill(this.ws)
      setTimeout(() => {
        console.log(stime(this, "Ok to Close:"), 'fulfill("timeout") = ', this.cnx_time)
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
    let reqs = req.cgType
    console.log(stime(this, ".eval_ack"), {ack, reqs, req})
    super.eval_ack(ack, req)
  }
}
class TestMsgAcked {
  message: CgMessage
  pAck: AckPromise
  constructor(pAck: AckPromise, expectMsg: (msg: CgMessage) => void, expectRej?: (reason: any) => void) {
    this.pAck = pAck
    this.message = pAck.message

    this.pAck.then((msg) => { expectMsg(msg) }, (reason: any) => { expectRej? expectRej(reason) : fail() })

    wsbase.ws.addEventListener('message', (ev: MessageEvent) => {
      let data = ev.data as DataBuf<CgMessage>
      let cgm = CgMessage.deserialize(data)
      let type = cgm.cgType
      console.log(stime(this), "ws.message received", {type, cgm})
      if (cgm.type === CgType.ack)
        this.pAck.fulfill(cgm)
    }, {once: true})
  }
}

/** create a WebSocketBase */
var wsbase = new TestSocketBase<pbMessage, pbMessage>()
var pwsbase = new EzPromise<TestSocketBase<pbMessage, pbMessage>>()

test("WebSocketBase.construct & connectws", () => {
  expect(wsbase).toBeInstanceOf(WebSocketBase)
  console.log(stime(), "try connect to echourl", testurl)
  wsbase.connectWebSocket(testurl, openP, closeP) // start the connection sequence --> openP
  expect(wsbase.ws).toBeInstanceOf(wsWebSocket)   // wsbase.ws exists
  console.log(stime(), "pwsbase.fulfill(wsbase)", readyState(wsbase.ws))
  pwsbase.fulfill(wsbase)                         // assert we have the components of wsbase & wsbase.ws
  setTimeout(() => openP.reject("timeout"), 500); // is moot if alaready connected
})

/** create a CgClient, stack it on the WebSocketDriver stream */
var cgclient: CgClient<pbMessage> = new TestCgClient();
var pCgClient = new EzPromise<CgClient<pbMessage>>();  // fulfill when stacked
test("CgClient.connectDnStream", () => {
  return pwsbase.then((wsbase) => {
    console.log(stime(), "try cgclient.connectDnStream")
    cgclient.connectDnStream(wsbase)
    expect(cgclient.dnstream).toBe(wsbase)
    expect(wsbase.upstream).toBe(cgclient)
    pCgClient.fulfill(cgclient)
  })
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

var pMsgsSent = new EzPromise<CgMessage>()
var group_name = "test_group"
var client_id = 1
var pPreSend: AckPromise  // expect Nak<"not a member">
var pSendJoin: AckPromise // from send_join
var pSendAck: AckPromise // from send_ack (resolved && value === undefined)

test("CgClient.sendNone", (done) => {
  return openP.then((ws) => {
    pPreSend = cgclient.send_none(group_name, 0, "preJoinFail")
    new TestMsgAcked(pPreSend, (ack) => {
      if (echoserver) {
        expect(ack.success).toBe(true)
        expect(ack.cause).toBe(group_name)
      } else {
        expect(ack.success).toBe(false)
        expect(ack.cause).toBe("not a member")
      }
      done() 
    }, (rej) => { 
      fail()
    })
  })
}, testTimeout - 2000)
test("CgClient.sendJoin & Ack", () => {
  return pPreSend.finally(() => {
    pSendJoin = cgclient.send_join(group_name, 1, "passcode1")
    new TestMsgAcked(pSendJoin, (msg) => {
      expect(msg.type).toEqual(CgType.ack)
      expect(msg.group).toEqual(group_name)
      expect(msg.cause).toEqual("joined")
      expect(msg.client_id).toEqual(1)
      expect(cgclient.isClient0()).toBe(false)
    })
    if (echoserver)
      pSendAck = cgclient.sendAck("joined", {client_id: 1, group: group_name})
    pMsgsSent.fulfill(pSendJoin)
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
        wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
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