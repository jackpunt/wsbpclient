import { argVal, buildURL, stime } from "@thegraid/common-lib"
import { wsWebSocketBase } from '../src/wsWebSocketBase'
import { wsWebSocket } from "../src/wsWebSocket"
import { EzPromise } from '@thegraid/ezpromise'
import { pbMessage, CloseInfo, readyState, CgClient  } from '../src'
import type { AWebSocket, WebSocketBase } from '../src'
import { closeStream, listTCPsockets, makeCgClient } from './testFuncs'

let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8444', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const servurl = buildURL('wss', host, 'thegraid.com', port)   // "wss://game7.thegraid.com:8444"
const testurl: string = servurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, don't expect server to ACK msgs
console.log(`testCnx:`, testurl)

function openAndClose(logMsg='') {
  let { wsbase: wsb, cgclient: cgc } = makeCgClient(testurl, {
    open: () => {
      console.log(stime(), `${logMsg} wsb opened & closing:`, wsb.closeState)
      setTimeout(() => {
        closeStream(wsb, `${logMsg} after wsb open timeout`)
      }, 10)
    },
    close: (ev: CloseEvent) => {
      let { type, wasClean, reason, code } = ev
      console.log(stime(), "wsb CLOSED:", { type, wasClean, reason, code }, readyState(wsb.ws))
    }
  })
}
let x = 1
openAndClose(`${x++}`)

setTimeout(() => {
  listTCPsockets()
}, 500)

