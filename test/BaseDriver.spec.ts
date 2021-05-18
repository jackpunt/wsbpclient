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

type CloseInfo = { code: number, reason: string }
function normalClose(reason:string): CloseInfo { return {code: CLOSE_CODE.NormalCLosure, reason: reason}}
var close_normal: CloseInfo = {code: CLOSE_CODE.NormalCLosure, reason: "test done" }
var close_fail: CloseInfo = { code: CLOSE_CODE.Empty, reason: "failed"}

/**
 * A WebSocketBase that uses wsWebSocket for a WebSocket.
 * 
 * Suitable for jest/node.js while testing without a browser WebSocket.
 */
class TestSocketBase<I extends pbMessage, O extends pbMessage> extends WebSocketBase<I, O> {
  // for jest/node: make a wsWebSocket(url), send messages upstream
  url: string

  connectWebSocket(ws: AWebSocket | string, openP?: EzPromise<AWebSocket>, closeP?: EzPromise<CloseInfo>) {
    if (typeof (ws) === 'string') {
      let url: string = this.url = ws;
      ws = new wsWebSocket(url); // TODO: handle failure of URL or connection
    }
    super.connectWebSocket(ws)

    this.ws.addEventListener('error', (ev: Event) => {
      console.log(stime(this, " ws error:"), ev)
      closeP.fulfill(close_fail)
    })

    this.ws.addEventListener('open', () => {
      console.log(stime(this, " ws open:"), "   openP.fulfill(ws)")
      openP.fulfill(this.ws)
    })

    this.ws.addEventListener('close', (ev: CloseEvent) => {
      console.log(stime(this, " ws close:"), {readyState: readyState(this.ws), reason: ev.reason})
      closeP.fulfill(normalClose(ev.reason))
    })
  }
}

class TestCgClient<O extends pbMessage> extends CgClient<O> {
  eval_send(message: CgMessage) {
    console.log(stime(this, `.eval_send[${this.client_id}]`), this.innerMessageString(message))
    this.sendAck("test-approve", {client_id: message.client_from})
  }

  /** when send_leave has been Ack'd, typically: closeStream */
  on_leave(cause: string) {
    //override CgBase so it does not auto-close the stream
    console.log(stime(this, `.onLeave [${this.client_id}]`), cause )
    if (this.client_id !== 0) return
    super.on_leave(cause)
  }
}
class TestMsgAcked {
  name: string;
  message: CgMessage
  pAck: AckPromise
  pAckp: EzPromise<AckPromise>
  constructor(name: string, pAck: AckPromise, pAckp: EzPromise<AckPromise>, expectMsg: (ack: CgMessage) => void, expectRej?: (reason: any) => void) {
    this.name = name;
    this.pAck = pAck
    this.pAckp = pAckp
    this.message = pAck.message

    this.pAck.then((ack) => { expectMsg(ack) }, (reason: any) => { expectRej? expectRej(reason) : null })
    this.pAck.finally(() => { pAckp.fulfill(pAck) }) 
    let listenForAck: EventListener =  (ev: Event) => {
      let data = (ev as MessageEvent).data as DataBuf<CgMessage>
      let cgm = CgMessage.deserialize(data)
      let { cgType, success, cause, client_id} = cgm
      console.log(stime(this), name, "listenForAck:", {cgType, success, cause, client_id})
      if (cgm.type === CgType.ack) {
        wsbase.removeEventListener('message', listenForAck)
      }
    }
    wsbase.addEventListener('message', listenForAck)
  }
}
class TestSocketBaseR<I extends pbMessage,O extends pbMessage> extends TestSocketBase<I,O> {}
class TestCgClientR<O extends pbMessage> extends TestCgClient<O> {}

var client0p = new EzPromise<CgMessage>()
var client1p = new EzPromise<CgMessage>()
var closeP0 = new EzPromise<CloseInfo>()

var cgClient0 = new TestCgClientR<never>()
var openP0 = new EzPromise<AWebSocket>()

test("client0 Open", () => {
  let openP = openP0
  let closeP = closeP0
  let wsbase = new TestSocketBaseR() // using wsWebSocket
  wsbase.connectWebSocket(testurl, openP, closeP)
  return openP.then((ws) => {
    console.log(stime(), "client0 OPEN")
    cgClient0.connectDnStream(wsbase)
    cgClient0.send_join(group_name, 0, "referee").then((ack: CgMessage) => { 
      console.log(stime(), "client0 JOINED: ", ack.success)
      expect(ack.success).toBeTruthy()
      expect(cgClient0.client_id).toBe(0)
      client0p.fulfill(ack)
      console.log(stime(), "client0 client0p.resolved=", client0p.resolved)
    })
  })
})



setTimeout(() => {
  client1p.fulfill(new CgMessage({type: CgType.none}))
}, 100);
/** create a WebSocketBase */
var wsbase = new TestSocketBase<pbMessage, pbMessage>()
var pwsbase = new EzPromise<TestSocketBase<pbMessage, pbMessage>>()

var openP = new EzPromise<AWebSocket>()
openP.catch((rej) => { console.log(stime(), "cnxP.catch", rej) })

test("WebSocketBase.construct & connectws", () => {
  return openP0.then((ack) => {
    expect(wsbase).toBeInstanceOf(WebSocketBase)
    console.log(stime(), "try connect to url =", testurl)
    wsbase.connectWebSocket(testurl, openP, closeP) // start the connection sequence --> openP
    expect(wsbase.ws).toBeInstanceOf(wsWebSocket)   // wsbase.ws exists
    console.log(stime(), "pwsbase.fulfill(wsbase)", readyState(wsbase.ws))
    pwsbase.fulfill(wsbase)                         // assert we have the components of wsbase & wsbase.ws
    setTimeout(() => openP.reject("timeout"), 500); // is moot if alaready connected
  })
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

var okToClose = new EzPromise<string>() // replaces pMsgsSent
var close_timeout = testTimeout - 500

test("WebSocket connected & OPEN", () => {
  return openP.then((ws) => {
    expect(ws).toBeInstanceOf(wsWebSocket)
    expect(ws.readyState).toBe(ws.OPEN);
    console.log(stime(this, " Set OkToClose timeout:"), 'fulfill("timeout") = ', close_timeout)
    setTimeout(() => {
      okToClose.fulfill("timeout")
    }, close_timeout)
  }, (rej) => {
    console.log("WebSocket connection rejected", rej)
    okToClose.fulfill("no websocket connection")
    fail(rej)
    //expect(rej).toBe("timeout") // never reached !! 
  })
})

var group_name = "test_group"
var pPreSendp = new EzPromise<AckPromise>()  // expect Nak<"not a member">

test("CgClient.sendNone & Nak", (done) => {
  return openP.then((ws) => {
    let pPreSend = cgclient.send_none(group_name, 0, "preJoinFail")
    new TestMsgAcked("CgClient.sendNone", pPreSend, pPreSendp, (ack) => {
      if (echoserver) {
        console.log(stime(), "echoserver returned", ack)
        expect(ack.success).toBe(true)
        expect(ack.cause).toBe(group_name)
      } else {
        console.log(stime(), "cgserver returned", cgclient.innerMessageString(ack))
        expect(ack.success).toBe(false)
        expect(ack.cause).toBe("not a member")
      }
      done() 
    }, (rej) => { 
      fail()
    })
  })
}, testTimeout - 2000)

var pSendJoinp = new EzPromise<AckPromise>() // from send_join
test("CgClient.sendJoin & Ack", () => {
  let cause = "joined", expect_id = 1
  return pPreSendp.finally(() => {
    let pSendJoin = cgclient.send_join(group_name, expect_id, "passcode1")
    console.log(stime(), "CgClient.sendJoin:")
    new TestMsgAcked("gClient.sendJoin", pSendJoin, pSendJoinp, (ack) => {
      expect(ack.type).toEqual(CgType.ack)
      expect(ack.group).toEqual(group_name)
      expect(ack.cause).toEqual(cause)
      expect(ack.client_id).toEqual(expect_id)
      expect(cgclient.client_id).toEqual(expect_id)
    })
    if (echoserver) {
      cgclient.sendAck(cause, {client_id: expect_id, group: group_name})
    }
  })
})

var pSendSendp = new EzPromise<AckPromise>()
test("CgClient.sendSend & Ack", () => {
  let cause = "send_done", client_id = cgclient.client_id // 1
  return pSendJoinp.finally(() => {
    let ackp = cgclient.sendAck("spurious!") // no response from server: ignored
    expect(ackp.resolved).toBe(true)         // sendAck is immediately resolved(undefined)
    ackp.then((ack) => { expect(ack).toBeUndefined() })

    let message = new CgMessage({ type: CgType.none, cause: "test send", client_id: 0 })
    console.log(stime(), `CgClient.sendSend[${client_id}]:`, cgclient.innerMessageString(message))
    let pSendSend = cgclient.send_send(message, { nocc: true })
    new TestMsgAcked("CgClient.sendSend", pSendSend, pSendSendp, (ack) => {
      expect(ack.type).toEqual(CgType.ack)
      expect(ack.cause).toEqual(cause)
      expect(ack.client_id).toBeUndefined()
    })
    if (echoserver) {
      cgclient.sendAck(cause, { client_id, group: group_name })
    }
  })
})

var pSendLeavep = new EzPromise<AckPromise>()
test("CgClient.sendLeave & Ack", () => {
  let cause = "test_done", client_id = cgclient.client_id // 1
  return pSendSendp.finally(() => {
    console.log(stime(), "CgClient.sendLeave & Ack:")
    let pSendLeave = cgclient.send_leave(group_name, client_id, cause)
    new TestMsgAcked("CgClient.sendLeave & Ack", pSendLeave, pSendLeavep, (msg) => {
      expect(msg.type).toEqual(CgType.ack)
      expect(msg.group).toEqual(group_name)
      expect(msg.cause).toEqual(cause)
      expect(msg.client_id).toEqual(cgclient.client_id)
      console.log(stime(), `CgClient.sendLeave Ack'd: okToClose.fulfill('${cause}')`)
      okToClose.fulfill(cause)               // signal end of test
    })
    if (echoserver) {
      cgclient.sendAck(cause, {client_id, group: group_name})
    }
  })
})

/** Promise filled({code, reason}) when socket is closed. */
var closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
closeP.catch((reason) => { console.log(stime(), "closeP-catch:", reason) })

describe("Closing", () => {
  test("BaseDriver.close client", () => {
    return okToClose.finally(() => {
      console.log(stime(), okToClose.value, `try closeStream(normal, '${close_normal.reason}')`)
      try {
        wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
      } catch (err) {
        console.log(stime(), "closeStream error:", err)
        closeP.fulfill(close_fail)
      }
    })
  })

  test("BaseDriver.client closed", (done) => {
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

  test("BaseDriver.verify closed", (done) => {
    return closeP.finally(() => {
      console.log(stime(), "verify closed:", readyState(wsbase.ws))
      setTimeout(() => {
        expect(wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED)
        done()
      }, 100)
    })
  })

  test("client0 Close", (done) => {
    return closeP0.then((cinfo) => {
      console.log(stime(), "client0 CLOSED:", cinfo, readyState(wsbase.ws))
      setTimeout(() => {
        console.log(stime(), "client0 END OF TEST!")
        setTimeout(() => {
          expect(wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED)
          done()
        }, 100)
      }, 10)
    })
  }, testTimeout-100)
})