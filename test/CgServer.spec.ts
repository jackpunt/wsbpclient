import { WebSocketBase } from '../src/BaseDriver'
import { DataBuf, stime, EzPromise, pbMessage, CLOSE_CODE, AWebSocket} from '../src/types'
import { CgClient } from '../src/CgClient'
import { CgMessage, CgType } from '../src/CgProto'
import type { AckPromise } from '../src/CgBase'
import { wsWebSocket, ws } from './wsWebSocket'
import { buildURL } from '@thegraid/common-lib'
import { TestSocketBase } from './TestSocketBase'

function readyState (ws: WebSocket): string {
  return ["CONNECTING" , "OPEN" , "CLOSING" , "CLOSED"][ws.readyState]
}
var testTimeout = 3000;
let showenv = !!process.argv.find((val, ndx, ary) => (val == "Xshowenv"))
let nomsgs = !!process.argv.find((val, ndx, ary) => (val == "Xnomsgs"))
let host = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "Xname")) || 'game7'
let portStr = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "Xport")) || '8444'
let port = Number.parseInt(portStr)

console.log(stime(), "CgServer.spec ", `args`, { argv: process.argv, host, port, nomsgs });
showenv && console.log(stime(), "CgServer.spec ", `env`, { argv: process.env })

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const cgservurl = buildURL('wss', host, 'thegraid.com', port) // "wss://game7.thegraid.com:8444"
const testurl: string = cgservurl;

const echoserver:boolean = (testurl == echourl)

type CloseInfo = { code: number, reason: string }
function normalClose(reason:string): CloseInfo { return {code: CLOSE_CODE.NormalCLosure, reason: reason}}
var close_normal: CloseInfo = {code: CLOSE_CODE.NormalCLosure, reason: "test done" }
var close_fail: CloseInfo = { code: CLOSE_CODE.Empty, reason: "failed"}

var testPromises: EzPromise<any>[] = [];
function testMessage<W>(name: string, thisP: EzPromise<W>, msgGen: () => AckPromise,
  expectMsg: (ack: CgMessage) => void, 
  expectRej?: (reason: any) => void,
  afterPrep?: () => void,
  timeout: number = testTimeout): EzPromise<AckPromise> {
  let priorP = thisP || testPromises[0]
  let nextP = new EzPromise<AckPromise>()
  test(name, () => {
    return priorP.then((fil: W) => {
      let msgP = msgGen()
      new TestMsgAcked(name, msgP, nextP, expectMsg, expectRej)
      if (!!afterPrep) afterPrep()
    })
  }, timeout)
  testPromises.unshift(nextP)
  return nextP
}

class TestCgClient<O extends CgMessage> extends CgClient<O> {
  eval_send(message: CgMessage) {
    let inner_msg = CgMessage.deserialize(message.msg)
    console.log(stime(this, `.eval_send[${this.client_id}]`), inner_msg.outObject())
    this.sendAck(`send-rcvd-${this.client_id}`, {client_id: message.client_from})
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
  /** msgGen creates pAck, run test.expect() when that ack/nak is fulfilled by CgBase.parseEval(ack/nak). */
  constructor(name: string, pAck: AckPromise, pAckp: EzPromise<AckPromise>, 
    expectMsg: (ack: CgMessage) => void, expectRej?: (reason: any) => void) {
    this.name = name;
    this.pAck = pAck
    this.pAckp = pAckp
    this.message = pAck.message

    this.pAck.then((ack) => { expectMsg(ack) }, (reason: any) => { !!expectRej && expectRej(reason) })
    this.pAck.finally(() => { pAckp.fulfill(pAck) }) 
    let handler = (msg: CgMessage) => { console.log(stime(this, `.listenForAck: FOUND FOR '${this.name}'`), msg.cgType) }
    wsbase.listenFor(CgType.ack, handler)
  }
}
/** A TestSocketBase<CgMessage, CgMessage>, which is a [mock-] WebSockectBase<I,O> */
class TestSocketBaseR<I extends CgMessage, O extends CgMessage> extends TestSocketBase<I,O> {}
/** CgClient in role of Referee: sends Ack/Nak */
class TestCgClientR<O extends CgMessage> extends TestCgClient<O> {
  eval_send(message: CgMessage) {
    console.log(stime(this, `.eval_send[${message.client_from} -> ${this.client_id}]`), this.innerMessageString(message))
    let inner_msg = CgMessage.deserialize(message.msg) // inner CgMessage, type==CgType.none
    if (inner_msg.type === CgType.none && inner_msg.cause == "NakMe") {
      this.sendNak(inner_msg.cause, { client_id: message.client_from })
      return
    }
    if (inner_msg.type === CgType.none && inner_msg.cause == "MsgInAck") {
      console.log(stime(this, `.eval_send[${this.client_id}]`), "Augment MsgInAck")
      inner_msg.info = inner_msg.cause   // augment inner 'none' message: info: "MsgInAck"
      let aug_msg = inner_msg.serializeBinary()  // prep 'none' message to insert into original 'send'
      message.msg = aug_msg
      message.info = "send(aug_none)"
      let aug_send = message.serializeBinary() // augment & re-serialize original CgMessage({type: CgType.send}, ...)
      let pAck = this.sendAck(inner_msg.cause, { client_id: message.client_from, msg: aug_send })
      console.log(stime(this, `.eval_send returning Ack`), pAck.message.outObject())
      return
    }
    this.sendAck("send-approved", {client_id: message.client_from})
  }
}

const openP0 = new EzPromise<AWebSocket>()
const closeP0 = new EzPromise<CloseInfo>()

const cgClient0 = new TestCgClientR<never>()

const group_name = "test_group"
const refDone = new EzPromise<boolean>()
let refwsbase: TestSocketBaseR<CgMessage, CgMessage> = new TestSocketBaseR() // using wsWebSocket

test("client0 (referee) Open", () => {
  console.log(stime(), "try connect referee to url =", testurl)
  refwsbase.connectWebSocket(testurl, openP0, closeP0)
  closeP0.then((info) => {
    console.log(stime(), `client0 (referee) closed [closeP Promise fulfill]`, info)
  })
  return openP0.then((ws) => {
    console.log(stime(), "client0 (referee wsbase) OPEN", (ws === refwsbase.ws))
    cgClient0.connectDnStream(refwsbase) // push TestCgClientR Driver
    cgClient0.send_join(group_name, 0, "referee").then((ack: CgMessage) => { 
      console.log(stime(), "client0 (referee) JOINED: ", ack.success)
      expect(ack.success).toBeTruthy()
      expect(cgClient0.client_id).toBe(0)
      refDone.fulfill(true)
      console.log(stime(), "client0 client0p.resolved=", refDone.resolved)
    })
  })
})

let wsbase: TestSocketBase<pbMessage, pbMessage>
const pwsbase = new EzPromise<TestSocketBase<pbMessage, pbMessage>>()

const openP = new EzPromise<AWebSocket>()
openP.catch((rej) => { console.log(stime(), "openP.catch", rej) })

/** Promise filled({code, reason}) when client wsbase.ws is closed. */
const closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
closeP.then((reason) => { console.log(stime(), "closeP-closed:", reason) })
closeP.catch((reason) => { console.log(stime(), "closeP-catch:", reason) })

const okToClose = new EzPromise<string>() // replaces pMsgsSent
const close_timeout = testTimeout - 500

test("wsbase.construct & connect", () => {
  // wait for previous test to complete
  return refDone.then((ack) => {
    wsbase = new TestSocketBase<pbMessage, pbMessage>() // create a WebSocket
    expect(wsbase).toBeInstanceOf(WebSocketBase)
    console.log(stime(), "try connect client to url =", testurl)
    wsbase.connectWebSocket(testurl, openP, closeP) // start the connection sequence --> openP
    expect(wsbase.ws).toBeInstanceOf(wsWebSocket)   // wsbase.ws exists
    console.log(stime(), "pwsbase.fulfill(wsbase)", readyState(wsbase.ws))
    pwsbase.fulfill(wsbase)                         // assert we have the components of wsbase & wsbase.ws
    setTimeout(() => openP.reject("timeout"), 500); // is moot if already connected/fulfilled
  })
})

/** create a CgClient, stack it on the WebSocketDriver stream */
const cgclient: CgClient<pbMessage> = new TestCgClient();
const pCgClient = new EzPromise<CgClient<pbMessage>>();  // fulfill when stacked
test("wsbase.push CgClient", () => {
  return pwsbase.then((wsbase) => {
    console.log(stime(), "CgClient.connectDnStream try connect CgClient Driver")
    cgclient.connectDnStream(wsbase)
    expect(cgclient.dnstream).toBe(wsbase)
    expect(wsbase.upstream).toBe(cgclient)
    pCgClient.fulfill(cgclient)
  })
})

test("wsbase.ws connected & OPEN", () => {
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

if (!nomsgs) {

testMessage("CgClient.preJoinFail", openP,
  () => cgclient.send_none(group_name, 0, "preJoinFail"), // send preJoin 'none' message: doomd to fail
  (ack) => {
    if (echoserver) {
      console.log(stime(), "echoserver returned", ack)
      expect(ack.success).toBe(true)
      expect(ack.cause).toBe(group_name)
    } else {
      console.log(stime(), "cgserver returned", cgclient.innerMessageString(ack))
      expect(ack.success).toBe(false)
      expect(ack.cause).toBe("not a member")
    }
  }, (rej) => {
    fail(rej)
  }, null, testTimeout - 2000);

{ let cause = "ref-approved", expect_id = 1
  testMessage("CgClient.sendJoin & Ack", null,
    () => cgclient.send_join(group_name, expect_id, "passcode1"),
    (ack) => {
      expect(ack.type).toEqual(CgType.ack)
      expect(ack.group).toEqual(group_name)
      expect(ack.cause).toEqual(cause)
      expect(ack.client_id).toEqual(expect_id)
      expect(cgclient.client_id).toEqual(expect_id)
    }, () => {
    echoserver && cgclient.sendAck(cause, {client_id: expect_id, group: group_name})
  })}

{ let client_id = cgclient.client_id, cause = "send_done"; // 1
  testMessage("CgClient.sendSend & Ack", null,
    () => {
      let ackp = cgclient.sendNak("spurious!") // no response from server: ignored
      expect(ackp.resolved).toBe(true)         // sendAck is immediately resolved(undefined)
      ackp.then((ack) => { expect(ack).toBeUndefined() })

      let message = new CgMessage({ type: CgType.none, cause: "test send", client_id: 0 })
      console.log(stime(), `CgClient.sendSend[${client_id}]:`, cgclient.innerMessageString(message))
      return cgclient.send_send(message, { nocc: true })
    }, (ack) => {
      console.log(stime(), `CgClient.sendSend returned ack:`, cgclient.innerMessageString(ack))
      expect(ack.type).toEqual(CgType.ack)
      expect(ack.cause).toEqual(cause)
      expect(ack.client_id).toBeUndefined()
      expect(ack.msg).toBeUndefined()
    }, null, () => {
      echoserver && cgclient.sendAck(cause, { client_id })
    }
  )}
  { let client_id = cgclient.client_id, cause = "MsgInAck", inner_sent: CgMessage
  testMessage("CgClient.sendSend MsgInAck", null,
    () => {
      let client_id = 0
      let message = new CgMessage({ type: CgType.none, cause, client_id })
      console.log(stime(), `CgClient.sendSendMsg[${client_id}]:`, cgclient.innerMessageString(message))
      return cgclient.send_send(message, { nocc: false, client_id: undefined })
    }, (ack) => {
      console.log(stime(), "CgClient.sendSendMsg returned ack:", cgclient.innerMessageString(ack))
      expect(ack.success).toBe(true)
      expect(ack.cause).toBe('send_done')  // all 'send' are Ack by server with 'send_done' QQQQ: should we fwd Ack from Referee?
      console.log(stime(this), "CgClient.sendSendMsg returned message", inner_sent.outObject())
      expect(inner_sent.type).toEqual(CgType.none)
      expect(inner_sent.cause).toEqual(cause)
      expect(inner_sent.info).toEqual(cause)
    }, (rej) => {
      fail()
    }, () => {
      echoserver && cgclient.sendAck('send_done', { client_id })
      wsbase.listenFor(CgType.send, (msg) => {
        inner_sent = CgMessage.deserialize(msg.msg)
        console.log(stime(), `RECEIVED SEND: ${inner_sent.outObject()}`)
      } )
    }, testTimeout - 2000)
}
{ let cause = "NakMe"
  testMessage("CgClient.sendNone for Nak", null,
    () => {
      let client_id = 0
      let message = new CgMessage({ type: CgType.none, cause, client_id })
      console.log(stime(), `CgClient.sendNoneNak[${client_id}]:`, cgclient.innerMessageString(message))
      return cgclient.send_send(message, { nocc: true })
    }, (ack) => {
      if (echoserver) {
        console.log(stime(), "echoserver returned", ack)
        expect(ack.success).toBe(true)
        expect(ack.cause).toBe(cause)
      } else {
        console.log(stime(), "cgserver returned", cgclient.innerMessageString(ack))
        expect(ack.success).toBe(false)
        expect(ack.cause).toBe(cause)
      }
    }, (rej) => {
      fail()
    }, null, testTimeout - 2000)
}
{ let cause = "test_done", client_id = cgclient.client_id // 1
  testMessage("CgClient.sendLeave & Ack", null,
    () => cgclient.send_leave(group_name, client_id, cause),
    (msg) => {
      expect(msg.type).toEqual(CgType.ack)
      expect(msg.group).toEqual(group_name)
      expect(msg.cause).toEqual(cause)
      expect(msg.client_id).toEqual(cgclient.client_id)
      console.log(stime(), `CgClient.sendLeave Ack'd: okToClose.fulfill('${cause}')`)
      okToClose.fulfill(cause)               // signal end of test
    },
    () => !!echoserver && cgclient.sendAck(cause, { client_id, group: group_name })
  )
}
} else {
  okToClose.fulfill("no_msgs")
}


describe("Closing", () => {
  test("wsbase.close client", () => {
    return okToClose.finally(() => {
      console.log(stime(), `Because "${okToClose.value}" try closeStream(normal, '${close_normal.reason}')`)
      if (!!wsbase) try {
        wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
        console.log(stime(), `closeState=`, wsbase.closeState)
      } catch (err) {
        console.log(stime(), "closeStream error:", err)
        closeP.fulfill(close_fail)
      } else {
        closeP.fulfill({code: 0, reason:'no wsbase'})
      }
    })
  })

  test("wsbase.client closed", () => {
    return closeP.then((info: CloseInfo) => {
      let { code, reason } = info
      console.log(stime(), `client closed: closeState=`, wsbase.closeState, info)
      if (code == close_fail.code) {
        expect(reason).toBe(close_fail.reason)
      } else {
        expect(code).toBe(close_normal.code)
        expect(reason || close_normal.reason).toBe(close_normal.reason)
      }
    },
      (rej: any) => {
        expect(rej).toBe(close_fail.reason)
      }).finally(()=>{
        refwsbase.closeStream(close_normal.code, close_normal.reason)
        console.log(stime(), `client0 closeStream: closeState=`, refwsbase.closeState)
      })
  }, testTimeout)

  test("wsbase.verify closed", () => {
    return closeP.finally(() => {
      console.log(stime(), `verify closed: closeState=`, wsbase.closeState)
      setTimeout(() => {
        expect(wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED)
      }, 100)
    })
  })

  test("client0.verify Close", () => {
    return closeP0.then((cinfo) => {
      console.log(stime(), `client0 CLOSED: closeState=`, wsbase.closeState, cinfo)
      expect(wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED)
    })
  }, testTimeout-100)

  test("All Closed", () => {
    return closeP0.finally(() => {
      let opened = wsWebSocket.socketsOpened, closed = wsWebSocket.socketsClosed
      expect(closed).toEqual(opened)
      console.log(stime(), `test done: socket count=`, { opened, closed, pid: process.pid })
    })
  })
})
test("timetolog", () => {
  return new Promise<void>((fulfill) => {
    setTimeout(() => { fulfill() }, 500)
  })
}) 
