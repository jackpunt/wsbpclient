import { argVal, AT, buildURL, stime } from "@thegraid/common-lib"
import { readyState } from '../src/index.js'
import { closeStream, listTCPsockets, makeCgClient } from './testFuncs.js'

let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8447', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const servurl = buildURL('wss', host, 'thegraid.com', port)   // "wss://game7.thegraid.com:8447"
const testurl: string = servurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, don't expect server to ACK msgs
console.log(stime(this, `Connect to testurl = ${AT.ansiText(['green'],testurl)}`))

function openAndClose(logMsg='') {
  let { wsbase: wsb, cgclient: cgc } = makeCgClient(testurl, {
    error: (ev) => {
      console.log(stime(), `${logMsg} ${AT.ansiText(['red'], 'wsb error:')}`, ev, wsb.closeState);
    },
    open: () => {
      console.log(stime(), `${logMsg} wsb opened & closing:`, wsb.closeState)
      setTimeout(() => {
        closeStream(wsb, `${logMsg} after wsb open timeout`)
      }, 10)
    },
    close: (ev: any) => {
      let { type, wasClean, reason, code } = ev
      console.log(stime(), "wsb CLOSED:", { type, wasClean, reason, code }, readyState(wsb.ws))
    }
  })
}
let x = 1
openAndClose(`testCnx-${x++}`)

setTimeout(() => {
  listTCPsockets()
}, 500)

