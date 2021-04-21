import { OPEN } from 'ws'
import { BaseDriver, WebSocketBase } from '../src/BaseDriver'
import { DataBuf, stime, EzPromise, pbMessage, CLOSE_CODE, READY_STATE} from '../src/types'
import wsWebSocket = require('ws')

var readyState = (wss: wsWebSocket) => {
  return ["CONNECTING" , "OPEN" , "CLOSING" , "CLOSED"][wss.readyState]
}
const echourl = "wss://game7.thegraid.com:8443"

var testTimeout = 3000;

var pbase = new EzPromise<BaseDriver<pbMessage, pbMessage>>()
var base = new BaseDriver<pbMessage, pbMessage>()
test("BaseDriver.constructor", () => {
  expect(base).toBeInstanceOf(BaseDriver)
  pbase.fulfill(base)
})

var pwsbase = new EzPromise<WebSocketBase<pbMessage, pbMessage>>()
var wsbase = new WebSocketBase<pbMessage, pbMessage>()
  
test("WebSocketBase.construct", () => {
  expect(wsbase).toBeInstanceOf(WebSocketBase)
  pwsbase.fulfill(wsbase)
}) 

var cnxP = new EzPromise<boolean>()
cnxP.catch((rej) => { console.log(stime(), "cnxP.catch", rej)}) 

var okToClose = new EzPromise<boolean>()

var k: wsWebSocket.ClientOptions
var wss = new wsWebSocket(echourl);
wss.on('error', (ev: Event) => {
  console.log(stime(), "wss error:", ev)
  closeP.fulfill(close_fail)
})
wss.addEventListener('open', () => {
  console.log(stime(), "wss connected! ")
  cnxP.fulfill(true)
  setTimeout(() => { 
    console.log(stime(), "Ok to Close now")
    okToClose.fulfill(true) 
  }, 1000)
})
setTimeout(()=>!cnxP.resolved && cnxP.reject("timeout"), 500); // is moot if already connected

test("WebSocket connected", () => {
  return cnxP.then((value) => {
    expect(wss.readyState == wss.OPEN)
    expect(value).toBe(true)
  }, (rej) => {
    expect(rej).toBe("timeout") // never reached !! 
  })
})

test("BaseDriver.connectws", () => {
  return pwsbase.then((wsbase) => {
    wsbase.connectws(wss)
    expect(wsbase.ws).toBe(wss)
  })
})

type CloseInfo = { code: number, reason: string }
var close_normal: CloseInfo = {code: CLOSE_CODE.NormalCLosure, reason: "test done" }
var close_fail: CloseInfo = { code: CLOSE_CODE.Empty, reason: "failed"}
/** Promise filled({code, reason}) when socket is closed. */
var closeP: EzPromise<CloseInfo> = new EzPromise<CloseInfo>()
closeP.catch((reason) => { console.log(stime(), "closeP-catch:", reason) })

test("BaseDriver.close client", () => {
  return okToClose.finally(() => {
    console.log(stime(), "try close client")
    wss.addEventListener("close", (ev) => {
      console.log(stime(), "closeStream:", readyState(wss), ev.reason)
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
    console.log(stime(), "client closed:", info, readyState(wss))
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
  closeP.finally(()=>{
    expect(wss.readyState === wss.CLOSED)
    setTimeout(()=> done(), 500)
  })
})
