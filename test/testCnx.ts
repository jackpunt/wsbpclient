import { buildURL, stime } from "@thegraid/common-lib"
import { AWebSocket, CloseInfo, close_fail, close_normal, EzPromise, pbMessage, readyState } from "../src"
import { wsWebSocketBase } from './wsWebSocketBase'
import { wsWebSocket } from "./wsWebSocket"

let host = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "Xname")) || 'game7'
let portStr = process.argv.find((val, ndx, ary) => (ndx>0 && ary[ndx-1] == "Xport")) || '8444'
let port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const cgservurl = buildURL('wss', host, 'thegraid.com', port) // "wss://game7.thegraid.com:8444"
const testurl: string = cgservurl;

const echoserver:boolean = (testurl == echourl)
console.log(`testCnx:`, testurl)
var wsbase = new wsWebSocketBase<pbMessage, pbMessage>()
var pwsbase = new EzPromise<wsWebSocketBase<pbMessage, pbMessage>>()

var openP = new EzPromise<AWebSocket>()
openP.then((ws) => {
  console.log(stime(), "client0 OPEN")
  console.log(stime(), `try closeStream(normal, '${close_normal.reason}')`)
  try {
    wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
  } catch (err) {
    console.log(stime(), "closeStream error:", err)
    closeP.fulfill(close_fail)
  }
})
openP.catch((rej) => { console.log(stime(), "cnxP.catch", rej) })
var closeP = new EzPromise<CloseInfo>()
closeP.then((cinfo) => {
  let opened = wsWebSocket.socketsOpened, closed = wsWebSocket.socketsClosed
  console.log(stime(), `test done: socket count=`, { opened, closed, pid: process.pid })
  console.log(stime(), "client0 CLOSED:", cinfo, readyState(wsbase.ws))
  setTimeout(() => { console.log(stime(), "client0 END OF TEST!") }, 10)
})

let tws = wsbase.connectWebSocket(testurl, openP, closeP)

