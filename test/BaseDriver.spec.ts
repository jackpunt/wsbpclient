import { BaseDriver, WebSocketBase } from '../src/BaseDriver'
import { DataBuf, stime, EzPromise, pbMessage, CLOSE_CODE, READY_STATE, AWebSocket} from '../src/types'
import { CgClient } from '../src/CgClient'
import wsWebSocket = require('ws')
import { CgMessage, CgType } from '../src/CgProto'
import type { AckPromise } from '../src/CgBase'

var readyState = (wss: wsWebSocket): string => {
  return ["CONNECTING" , "OPEN" , "CLOSING" , "CLOSED"][wss.readyState]
}
var testTimeout = 3000;

const echourl = "wss://game7.thegraid.com:8443"


class TestSocketBase<I extends pbMessage, O extends pbMessage> extends WebSocketBase<I, O> {
  // for jest/node: make a wsWebSocket(url), send messages upstream
  url: string
  connectWebSocket(ws: AWebSocket | string, openP?: EzPromise<wsWebSocket>, closeP?: EzPromise<CloseInfo>) {
    if (typeof (ws) === 'string') {
      let cnx_time = 1000;
      let url = this.url = ws;
      let wss = new wsWebSocket(url); // TODO: handle failure of URL or connection
      wss.binaryType = "arraybuffer";

      wss.on('error', (ev: Event) => {
        console.log(stime(), "wss error:", ev)
        closeP.fulfill(close_fail)
      })

      wss.on('open', () => {
        console.log(stime(), "wss connected & open!   openP.fulfill(wss)")
        openP.fulfill(wss)
        setTimeout(() => {
          console.log(stime(), 'Ok to Close: fulfill("timeout") = ', cnx_time)
          okToClose.fulfill("timeout")
        }, cnx_time)
      })

      // fwd message.data from this<wsWebSocket> to BaseDriver:
      wss.on('message', (data: DataBuf<pbMessage>) => {
        //console.log("message event received:", { type: ev.type, data: ev.data })
        this.wsmessage(data)
      })
      ws = wss as unknown as AWebSocket;  // may be null
    }
    this.ws = ws;  // may be null
  }
  get wss() {return this.ws as unknown  as wsWebSocket}
}

class TestCgClient<O extends pbMessage> extends CgClient<O> {
  wsmessage(data: DataBuf<O>) {
    console.log(stime(), "TestCgClient.wsmessage data=", data)
    super.wsmessage(data)
  }
  msgPromiseByType: Record<string, AckPromise> = {}
  sendToSocket(message: CgMessage): AckPromise {
    let rv = super.sendToSocket(message)
    this.msgPromiseByType[message.type] = rv // holds the LATEST AckPromise, for each message.type
    return rv
  }
  eval_ack(ack: CgMessage, req: CgMessage) {
    console.log(stime(), "eval_ack:", ack, "for req", req)
    super.eval_ack(ack, req)
  }
}
let configWebSocket = (wsbase: TestSocketBase<pbMessage, pbMessage>) => {
  var wsopts: wsWebSocket.ClientOptions
  //wsbase.connectws(echourl)
  let wss = wsbase.wss
}
var pwsbase = new EzPromise<TestSocketBase<pbMessage, pbMessage>>()
var wsbase = new TestSocketBase<pbMessage, pbMessage>()

test("WebSocketBase.construct & connectws", () => {
  expect(wsbase).toBeInstanceOf(WebSocketBase)
  console.log(stime(), "try connect to echourl", echourl)
  wsbase.connectWebSocket(echourl, cnxOpen, closeP)
  expect(wsbase.ws).toBeInstanceOf(wsWebSocket)
  console.log(stime(), "pwsbase.fulfill(wsbase)", readyState(wsbase.wss))
  pwsbase.fulfill(wsbase)
  setTimeout(() => cnxOpen.reject("timeout"), 500); // is moot if alaready connected
})

var cnxOpen = new EzPromise<wsWebSocket>()
cnxOpen.catch((rej) => { console.log(stime(), "cnxP.catch", rej) })

var okToClose = new EzPromise<string>()

test("WebSocket connected & OPEN", () => {
  return cnxOpen.then((wss) => {
    expect(wss).toBeInstanceOf(wsWebSocket)
    expect(wss.readyState).toBe(wss.OPEN)
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
test("CgClient.connectToStream", () => {
  return pwsbase.finally(() => {
    console.log(stime(), "try cgclient.connectToStream")
    cgclient.connectDnStream(wsbase)
    expect(cgclient.dnstream).toBe(wsbase)
    expect(wsbase.upstream).toBe(cgclient)
    pMsg0 = cgclient.send_join(group_name, 1, "passcode1")
    pMsg1 = cgclient.sendAck("joined", {client_id: 1, group: group_name})
    //console.log("send messages: pMsg0=", pMsg0, "pMsg1=", pMsg1)
    pMsgsSent.fulfill(pMsg0)
  })
})

type MessageEvent = { data: any, type: string, target: wsWebSocket }

test("wss.message received", done => {
  pwsbase.then((wsbase) => {
    let nth = 0;
    let event_message: MessageEvent
    wsbase.wss.addEventListener("message", (ev: MessageEvent) => {
      event_message = ev
      expect(event_message.data).toBeTruthy()
      let data = event_message.data as DataBuf<CgMessage>
      let cgm = CgMessage.deserialize(data)
      console.log(stime(), "wss.message received", ++nth, cgm)
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
      wsbase.wss.addEventListener("close", (ev) => {
        console.log(stime(), "closeStream:", readyState(wsbase.wss), ev.reason)
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
      console.log(stime(), "client closed:", info, readyState(wsbase.wss))
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
      expect(wsbase.wss.readyState === wsbase.wss.CLOSED)
      setTimeout(() => done(), 100)
    })
  })
})