import { argVal, AT, buildURL, json, stime } from "@thegraid/common-lib"
import { CgClient, CgMessage, CgType, readyState, wsWebSocketBase } from '../src/index.js'
import { closeStream, listTCPsockets, makeCgClient } from './testFuncs.js'

let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8447', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const servurl = buildURL('wss', host, 'thegraid.com', port)   // "wss://game7.thegraid.com:8447"
const testurl: string = servurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, don't expect server to ACK msgs
console.log(stime(this, `Connect to testurl = ${AT.ansiText(['green'],testurl)}`))
const group_name = 'testGroup'

function openAndClose(logMsg = '') {
  const errorf = (ev) => { // dubious binding of 'wsb'...
    console.log(stime(), `${logMsg} ${AT.ansiText(['red'], 'wsb error:')}`, ev, wsb.closeState);
  }
  const closef = (ev: CloseEvent) => {
      let { type, wasClean, reason, code } = ev
      console.log(stime(), "wsb CLOSED:", {ev: json({ type, wasClean, reason, code}), state: readyState(wsb.ws)})
    }

  let waitClose = (wsb, wait=100) => {
    setTimeout(() => closeStream(wsb, `${logMsg}.waitClose (${wait})`), wait)
  }
  let refJoin = () => {
    let ackp = cgc.send_join(group_name, 0, 'referee')
    ackp.then((msg: CgMessage) => {
      let { wsbase, cgclient } = makeCgClient(testurl, {
        error: errorf, close: closef, open: (ev) => {
          clientJoin(cgclient)
        }
      })
     })
  }

  let clientJoin = (cgc: CgClient<CgMessage>) => {
    let ackp = cgc.send_join(group_name)
    ackp.then((msg: CgMessage) => {
      //waitClose(cgc.dnstream)
      cgSend(cgc)
    })
  }
  let cgSend = (cgc: CgClient<CgMessage>) => {
    let msg = cgc.makeCgMessage({
      type: CgType.send,
      client_id: cgc.client_id,
      success: true,
      cause: 'testing',
      //info: 'not a real CgType.send message!',
    })
    let ackp = cgc.send_send(msg, {nocc: true})
    ackp.then(() => waitClose(cgc))
  }

  let { wsbase: wsb, cgclient: cgc } = makeCgClient(testurl, {
    error: errorf, close: closef, open: (ev) => {
      console.log(stime(), `${logMsg} wsb opened & closing:`, wsb.closeState, json(ev))
      //waitClose(wsb)
      //clientJoin(cgc)
      refJoin()
    }    
  })
  wsb.log = 0
  cgc.log = 1
}
let x = 1
openAndClose(`testJoin-${x++}`)

setTimeout(() => {
  listTCPsockets()
}, 500)

