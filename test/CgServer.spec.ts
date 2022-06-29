import { argVal, buildURL } from '@thegraid/common-lib'
import { WebSocketBase } from '../src/BaseDriver.js'
import type { AckPromise } from '../src/CgBase.js'
import type { CgClient } from '../src/CgClient.js'
import { CgMessage, CgType } from '../src/CgProto.js'
import { AWebSocket, CloseInfo, CLOSE_CODE, EzPromise, pbMessage, stime, readyState } from '../src/types.js'
import { wsWebSocket } from '../src/wsWebSocket.js'
import { TestCgClient, TestCgClientR, wsWebSocketBase } from '../src/wsWebSocketBase.js'
import { listTCPsockets } from './testFuncs.js'

var testTimeout = 3000;
let showenv = !!process.argv.find((val, ndx, ary) => (val == "Xshowenv"))
let nomsgs = !!process.argv.find((val, ndx, ary) => (val == "Xnomsgs"))
let nomsglog = !!process.argv.find((val, ndx, ary) => (val == "Xnomsglog"))
let xkill = !!process.argv.find((val, ndx, ary) => (val == "Xkill"))

let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8447', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const cgservurl = buildURL('wss', host, 'thegraid.com', port) // "wss://game7.thegraid.com:8447"
const testurl: string = cgservurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, expect no Ack.

console.log(stime(), "CgServer.spec ", `args`, { argv: process.argv, host, port, nomsgs });
showenv && console.log(stime(), "CgServer.spec ", `env`, { argv: process.env })


function normalClose(reason:string): CloseInfo { return {code: CLOSE_CODE.NormalClosure, reason: reason}}
const close_normal: CloseInfo = {code: CLOSE_CODE.NormalClosure, reason: "test done" }
const close_fail: CloseInfo = { code: CLOSE_CODE.Empty, reason: "failed"}

const testPromises: EzPromise<any>[] = [];
/** function to track that sent msg recv's expected response. */
function testMessage<W>(name: string, priorP: EzPromise<W>, msgGen: () => AckPromise,
  expectMsg: (ack: CgMessage) => void, 
  expectRej?: (reason: any) => void,
  afterPrep?: () => void,
  timeout: number = testTimeout): EzPromise<AckPromise> {
  priorP = priorP || testPromises[0]
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

/** helper class for function testMessage() */
class TestMsgAcked {
  name: string;
  message: CgMessage
  pAck: AckPromise
  pAckp: EzPromise<AckPromise>
  /** msgGen creates pAck, run test.expect() when that AckPromise(ack/nak) is fulfilled by CgBase.parseEval(ack/nak). */
  constructor(name: string, pAck: AckPromise, pAckp: EzPromise<AckPromise>, 
    expectMsg: (ack: CgMessage) => void, expectRej?: (reason: any) => void) {
    this.name = name;
    this.pAck = pAck
    this.pAckp = pAckp
    this.message = pAck.message

    this.pAck.then(
      (ack) => { expectMsg(ack) },
      (reason: any) => { !!expectRej && expectRej(reason) }
    )
    this.pAck.finally(() => { pAckp.fulfill(pAck) })
    let handler = (msg: CgMessage) => { nomsglog || console.log(stime(this, `.listenForAck: '${this.name}' ==> ${msg.msgType}`)) }
    wsbase.listenFor(CgType.ack, handler)
  }
}

function makeTestCgClient(ignore, url: string | AWebSocket, listeners: { open?: EventListenerOrEventListenerObject, close?: EventListenerOrEventListenerObject, error?: EventListenerOrEventListenerObject, message?: EventListenerOrEventListenerObject } = {}) {
  let wsbase = new wsWebSocketBase()
  let cgclient = wsbase.connectStream(url, TestCgClient)[1] as CgClient<CgMessage>;
  listeners.open && cgclient.addEventListener('open', listeners.open)
  listeners.close && cgclient.addEventListener('close', listeners.close)
  listeners.error && cgclient.addEventListener('error', listeners.error)
  listeners.message && cgclient.addEventListener('message', listeners.message)
  return { wsbase, cgclient }
}

const openP0 = new EzPromise<AWebSocket>(); // referee: refwsbase
const closeP0 = new EzPromise<CloseInfo>(); // referee: refwsbase
/** Promise filled({code, reason}) when client wsbase.ws is closed. */
const closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
closeP.then((cinfo) => { console.log(stime("closeP-wsbase", ".closed:"), cinfo) })
closeP.catch((reason) => { console.log(stime("closeP-wsbase", ".catch:"), reason) })

/** a CgClient as Referee. */
const cgClient0 = new TestCgClientR<never>()
/** create a CgClient, stack it on the WebSocketDriver stream */
const cgclient: CgClient<pbMessage> = new TestCgClient();
let cgclient2: CgClient<CgMessage>

/** a wsBaseDriver */
const wsbase: wsWebSocketBase<pbMessage, pbMessage>= new wsWebSocketBase<pbMessage, pbMessage>() // create a WebSocket Driver
const okToClose = new EzPromise<string>() // 

const group_name = "test_group"
const refDone = new EzPromise<boolean>()
let refwsbase = new wsWebSocketBase() // using wsWebSocket
const openP = new EzPromise<AWebSocket>()

describe("Opening", () => {
  test("client0 (referee) Open", () => {
    console.log(stime(), "try connect referee to url =", testurl)
    refwsbase.connectWebSocket(testurl, openP0, closeP0)
    closeP0.then((info) => {
      console.log(stime(), `closeP0 fulfilled [presumably client0 closed]`, info)
    })
    return openP0.then((ws) => {
      console.log(stime(), "client0 (referee wsbase) OPEN", (ws === refwsbase.ws))
      false && listTCPsockets()
      cgClient0.connectDnStream(refwsbase) // push TestCgClientR Driver
      cgClient0.send_join(group_name, 0, "referee").then((ack: CgMessage) => {
        console.log(stime(), "client0 (referee) JOINED: ", ack.success)
        expect(ack.success).toBeTruthy()
        expect(cgClient0.client_id).toBe(0)
        refDone.fulfill(true)
        console.log(stime(), "client0 refDone.resolved=", refDone.resolved)
      })
    }, (reason) => {
        console.log(stime(), `client0 (referee) FAILED to open:`, reason)
        refDone.reject(reason)
        closeP0.fulfill({ code: 0, reason: `failed to open: ${reason}`})
    })
  })
  // cgclient2 -- do nothing, closeStream() when refwsbase.closedStream()
  openP.finally(() => {
    //let cgclient = new TestCgClient()
    let { wsbase, cgclient } = makeTestCgClient(TestCgClient, testurl, {
      open: () => {
        console.log(stime(), `cgclient2 open -- send_join`)
        cgclient.send_join(group_name)
      },
      close: (ev: { target }) => {
        console.log(stime(), `cgclient2 close -- closeState: `, wsbase.closeState)
      }
    })

    let wswebSocket = (wsbase.ws as wsWebSocket)
    wswebSocket.addEventListener('close', (ev: CloseEvent) => {
      console.log(stime(), `cgclient wswebSocket.close -- ev:`, {code: ev.code, reason: ev.reason})
      let opened = wsWebSocket.socketsOpened, closed = wsWebSocket.socketsClosed
      console.log(stime(), `cgclient2 wsWebSocket.close -- socket count=`, { opened, closed, pid: process.pid })
    })
    let wss = wswebSocket.wss
    wss.addListener('close',(code, msg) => {
      console.log(stime(), `cgclient2 wss.close -- readyState =`, wss.readyState)
      let opened = wsWebSocket.socketsOpened, closed = wsWebSocket.socketsClosed
      console.log(stime(), `cgclient2 wss.close -- socket count=`, { opened, closed, pid: process.pid })
    })
    console.log(stime(), 'client2 made -- url =', wsbase.url)
    cgclient2 = cgclient
  })

  openP.catch((rej) => { console.log(stime(), "openP.catch", rej) })

  const close_timeout = testTimeout - 500

  test("wsbase.construct & connect", () => {
    // wait for previous test to complete
    return refDone.then((ack) => {
      expect(wsbase).toBeInstanceOf(WebSocketBase)

      cgclient.connectDnStream(wsbase)   // push CgClient Driver
      expect(cgclient.dnstream).toBe(wsbase)
      expect(wsbase.upstream).toBe(cgclient)

      console.log(stime(), "try connect client to url =", testurl)
      wsbase.connectWebSocket(testurl, openP, closeP) // start the connection sequence --> openP
      expect(wsbase.ws).toBeInstanceOf(wsWebSocket)   // wsbase.ws exists
      let timeout = 500
      console.log(stime(), `readyState(wsbase.ws) = ${readyState(wsbase.ws)} timeout in ${timeout}ms`)
      setTimeout(() => openP.reject("timeout"), timeout); // is moot if already connected/fulfilled
    })
  })

  test("wsbase.ws connected & OPEN", () => {
    return openP.then((ws) => {
      expect(ws).toBeInstanceOf(wsWebSocket)
      expect(ws.readyState).toBe(ws.OPEN);
      console.log(stime(this, ` setTimeout(okToClose.fulfill("timout"), ${close_timeout})`))
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
})

if (!nomsgs) {
  describe("Messages", () => {
    test('run message tests', () => {
      return openP.finally(() => {console.log(stime(), `run message tests: console.log = ${!nomsglog}`)})
    })
    
    testMessage("CgClient.preJoinFail", openP,
      () => cgclient.send_none(group_name, 0, "preJoinFail"), // send preJoin 'none' message: doomd to fail
      (ack) => {
        if (echoserver) {
          nomsglog || console.log(stime(), "echoserver returned", ack)
          expect(ack.success).toBe(true)
          expect(ack.cause).toBe(group_name)
        } else {
          nomsglog || console.log(stime(), "cgserver returned", cgclient.innerMessageString(ack))
          expect(ack.success).toBe(false)
          expect(ack.cause).toBe("not a member")
        }
      }, (rej) => {
        fail(rej)
      }, null, testTimeout - 2000);
    {
      let cause = "ref-approved", expect_id = 1
      testMessage("CgClient.sendJoin & Ack", null,
        () => cgclient.send_join(group_name, expect_id, "passcode1"),
        (ack) => {
          expect(ack.type).toEqual(CgType.ack)
          expect(ack.group).toEqual(group_name)
          expect(ack.cause).toEqual(cause)
          expect(ack.client_id).toEqual(expect_id)
          expect(cgclient.client_id).toEqual(expect_id)
        }, () => {
          echoserver && cgclient.sendAck(cause, { client_id: expect_id, group: group_name })
        })
    }

    if (xkill) testMessage("Referee.kill.client", null,
      () => {
        console.log(stime(), `referee kick [${cgclient.client_id}]`)
        return cgClient0.send_leave(group_name, cgclient.client_id, 'kick&close')
      },
      (ack) => {
        expect(ack.type).toEqual(CgType.ack)
        expect(ack.group).toEqual(group_name)
      },
      (reason) => {
        console.log(stime(), `referee kick [${cgclient.client_id}] failed: reason = ${reason}`)
      })

    {
      let client_id = cgclient.client_id, cause = "send_done"; // 1
      testMessage("CgClient.sendSend & Ack", null,
        () => {
          let ackp = cgclient.sendNak("spurious!") // no response from server: ignored
          expect(ackp.resolved).toBe(true)         // sendAck is immediately resolved(undefined)
          ackp.then((ack) => { expect(ack).toBeUndefined() })

          let message = new CgMessage({ type: CgType.none, cause: "test send", client_id: 0 })
          nomsglog || console.log(stime(), `CgClient.sendSend[${client_id}]:`, cgclient.innerMessageString(message))
          return cgclient.send_send(message, { nocc: true })
        }, (ack) => {
          nomsglog || console.log(stime(), `CgClient.sendSend returned ack:`, cgclient.innerMessageString(ack))
          expect(ack.type).toEqual(CgType.ack)
          expect(ack.cause).toEqual(cause)
          expect(ack.client_id).toBeUndefined()
          expect(ack.msg).toBeUndefined()
        }, null, () => {
          echoserver && cgclient.sendAck(cause, { client_id })
        }
      )
    }
    {
      let client_id = cgclient.client_id, cause = "MsgInAck", inner_sent: CgMessage
      let here = 'CgClient.sendSendMsg'
      testMessage("CgClient.sendSend MsgInAck", null,
        () => {
          let client_id = 0
          let message = new CgMessage({ type: CgType.none, cause, client_id })
          nomsglog || console.log(stime(here), `[${client_id}]:`, cgclient.innerMessageString(message))
          return cgclient.send_send(message, { nocc: false, client_id: undefined })
        }, (ack) => {
          nomsglog || console.log(stime(here), "returned ack:", cgclient.innerMessageString(ack))
          expect(ack.success).toBe(true)
          expect(ack.cause).toBe('send_done')  // all 'send' are Ack by server with 'send_done' QQQQ: should we fwd Ack from Referee?
          nomsglog || console.log(stime(here), "returned message", inner_sent.msgObject())
          expect(inner_sent.type).toEqual(CgType.none)
          expect(inner_sent.cause).toEqual(cause)
          expect(inner_sent.info).toEqual(cause)
        }, (rej) => {
          fail()
        }, () => {
          echoserver && cgclient.sendAck('send_done', { client_id })
          wsbase.listenFor(CgType.send, (msg) => {
            inner_sent = CgMessage.deserialize(msg.msg)
            nomsglog || console.log(stime(here), `RECEIVED SEND:`, inner_sent.msgObject())
          })
        }, testTimeout - 2000)
    }
    {
      let cause = "NakMe", here = "CgClient.sendNoneNak"
      testMessage("CgClient.sendNone for Nak", null,
        () => {
          let client_id = 0
          let message = new CgMessage({ type: CgType.none, cause, client_id })
          nomsglog || console.log(stime(here), `[${client_id}]:`, cgclient.innerMessageString(message))
          return cgclient.send_send(message, { nocc: true })
        }, (ack) => {
          if (echoserver) {
            nomsglog || console.log(stime(here), "echoserver returned", ack)
            expect(ack.success).toBe(true)
            expect(ack.cause).toBe(cause)
          } else {
            nomsglog || console.log(stime(here), "cgserver returned", cgclient.innerMessageString(ack))
            expect(ack.success).toBe(false)
            expect(ack.cause).toBe(cause)
          }
        }, (rej) => {
          fail()
        }, null, testTimeout - 2000)
    }
    {
      let cause = "test_done", client_id = cgclient.client_id // 1
      testMessage("CgClient.sendLeave & Ack", null,
        () => cgclient.send_leave(group_name, client_id, cause),
        (msg) => {
          expect(msg.type).toEqual(CgType.ack)
          expect(msg.group).toEqual(group_name)
          expect(msg.cause).toEqual(cause)
          expect(msg.client_id).toEqual(cgclient.client_id)
          nomsglog || console.log(stime(), `CgClient.sendLeave Ack'd: okToClose.fulfill('${cause}')`)
          okToClose.fulfill(cause)               // signal end of test
        },
        () => !!echoserver && cgclient.sendAck(cause, { client_id, group: group_name })
      )
    }
  })
} else {
  let no_msg_time = 300
  console.log(stime(), `no messages: setTimeout(okToClose.fulfill("no_msgs"), ${no_msg_time})`)
  setTimeout(() => { okToClose.fulfill("no_msgs") }, no_msg_time)
}


describe("Closing", () => {
  test("wsbase.close client", () => {
    let here = `wsbase.close`
    return okToClose.finally(() => {
      console.log(stime(here), `Because "${okToClose.value}" try wsbase.closeStream(normal, '${close_normal.reason}')`)
      expect(wsbase).not.toBeNull()
      if (!!wsbase) try {
        wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
        console.log(stime(here), `closeState=`, wsbase.closeState)
      } catch (err) {
        console.log(stime(here), "closeStream error:", err)
        closeP.fulfill(close_fail)
      } else {
        console.log(stime(here), `closeState= 'no wsbase'`)
        closeP.fulfill({code: 0, reason:'no wsbase'})
      }
    })
  })

  test("wsbase.client closed", () => {
    let here = "wsbase.closed:"
    closeP.then(
      (info: CloseInfo) => {
        let { code, reason } = info
        console.log(stime(here), `closeState=`, wsbase.closeState, info)
        if (code == close_fail.code) {
          expect(reason).toBe(close_fail.reason)
        } else {
          expect(code).toBe(close_normal.code)
          expect(reason || close_normal.reason).toBe(close_normal.reason)
        }
      },
      (rej: any) => {
        expect(rej).toBe(close_fail.reason)
      })
    return closeP.finally(
      () => {
        console.log(stime(here), !!cgclient2 ? `cgclient2.closeStream(normal)` : `no cgclient2`)
        !!cgclient2 && cgclient2.closeStream(close_normal.code, close_normal.reason)
        refwsbase.closeStream(close_normal.code, close_normal.reason); // ==> close() ==> cP0.fulfill()
        console.log(stime(here), `refwsbase.closeState=`, refwsbase.closeState)
        false && listTCPsockets()
      })
  }, testTimeout)

  test("wsbase.verify closed", () => {
    return closeP.finally(() => {
      console.log(stime(), `verify closed: wsbase.closeState=`, wsbase.closeState)
      setTimeout(() => {
        expect(wsbase.ws && wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED);
      }, 100)
    })
  })

  test("client0.verify Close", () => {
    return closeP0.then((cinfo) => {
      console.log(stime(), `client0 CLOSED: closeState=`, wsbase.closeState, cinfo)
      expect(wsbase.ws && wsbase.ws.readyState).toEqual(wsbase.ws.CLOSED)
      false && listTCPsockets()
    })
  }, testTimeout-100)

  test("All Closed", () => {
    return closeP0.finally(() => {
      let n = 0, closed = 0, opened = 0
      if (false) {
      n = listTCPsockets().length
      opened = wsWebSocket.socketsOpened, closed = wsWebSocket.socketsClosed
      }
      console.log(stime(`All Closed:`), `socket count=`, { opened, closed, pid: process.pid })
      expect(n).toBe(0)
      expect(closed).toEqual(opened)
      setTimeout(() => { waitToLog.fulfill() }, 200)
      
    })
  })
})
let waitToLog = new EzPromise<void>()
test("timetolog", () => {
  return waitToLog.then(() => {
    expect(true).toBeTruthy()
  })
}) 
