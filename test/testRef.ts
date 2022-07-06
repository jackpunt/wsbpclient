import { argVal, AT, buildURL, json, stime } from "@thegraid/common-lib"
import { GgMessage, GgType } from "../src/GgProto.js"
import { addEnumTypeString, CgBase, CgClient, CgMessage, CgType, GgClient, GgRefMixin, LeaveEvent, pbMessage, readyState, WebSocketBase } from '../src/index.js'
import { wsWebSocketBase } from '../src/wsWebSocketBase.js'
import { addListeners, closeStream, listTCPsockets, makeCgClient, wssPort } from './testFuncs.js'

let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8447', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const servurl = buildURL('wss', host, 'thegraid.com', port)   // "wss://game7.thegraid.com:8447"
const testurl: string = servurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, don't expect server to ACK msgs
console.log(stime(this, `Connect to testurl = ${AT.ansiText(['green'],testurl)}`))
const group_name = 'testGroup'

declare module '../src/GgProto' {
  interface GgMessage {
    msgType: string
    client_from: number // GgReferee expects GgMessage to have a slot for client_from
  }
}
addEnumTypeString(GgMessage, GgType)
class GgClientForRef extends GgClient<GgMessage> {} // reify generics for 'typeof' in next line:
class TestGgRef extends GgRefMixin<GgMessage, typeof GgClientForRef>(GgClient) {

}
function openAndClose(logMsg = '') {
  let clientN = 0
  const errorwsb = (wsb, logmsg=logMsg) => {
    return (ev: any) => { // dubious binding of 'wsb'...
      console.error(stime(undefined, `errorf: ${logmsg} ${AT.ansiText(['red'], 'wsb error:')}`), ev, wsb.closeState);
    }
  }
  const closewsb = (wsb: WebSocketBase<pbMessage, pbMessage>, logmsg = logMsg) => {
    return (ev) => {
      let { type, wasClean, reason, code } = ev, evs = json({ type, wasClean, reason, code })
      console.log(stime(undefined, `closef: ${logmsg}`), { ev: evs, state: readyState(wsb.ws) })
    }
  }

  let waitClose = (wsb: WebSocketBase<pbMessage, pbMessage>, logmsg = logMsg, wait=100, closer?: (ev)=>void) => {
    let port = wssPort(wsb as wsWebSocketBase<pbMessage, pbMessage>)
    setTimeout(() => closeStream(wsb, `${logmsg}.waitClose(${wait}, ${port}) `), wait, closer)
  }
  let refJoin = (onRef: (wsbase, cgbase) => void) => {
    let ggRef = new TestGgRef(GgMessage, CgBase, wsWebSocketBase)
    let cgbase = ggRef.cgBase
    let wsbase = ggRef.wsbase as wsWebSocketBase<pbMessage, GgMessage>
    let cgl = {
      error: errorwsb(wsbase), 
      close: closewsb(wsbase, 'ref'),
      open: async (ev) => {
        console.log(stime('refJoin', `.open: wssPort=`), wssPort(wsbase))
        await cgbase.send_join(group_name, 0, 'referee')
        onRef(wsbase, cgbase)
      }, 
      leave: (ev) => {
        this.client_leave(ev as unknown as LeaveEvent) // handled in GgRefMixin.RefereeBase
      }
    }
    addListeners(cgbase, cgl)
    ggRef.connectStack(testurl) // wsbase.connectWebSocket(testurl); wsbase.ws.addEL(onOpen)
  }

  let cgSend = async (cgc: CgClient<CgMessage>, info='fakeSend') => {
    let msg = cgc.makeCgMessage({
      type: CgType.send,
      client_id: cgc.client_id,
      success: true,
      cause: 'cgSend',
      info: info,
    })
    return cgc.send_send(msg, {nocc: true})
  }
  let clientRun = async (cgc: CgClient<CgMessage>) => {
    let ack0 = await cgc.send_join(group_name)
    let ack1 = await cgSend(cgc, `send${clientN}`)
    //let ack2 = await cgSend(cgc, 'send2\\b')
  }
  let makeClientAndRun = () => {
    let nc = ++clientN, clients = `client${nc}`
    let done, pdone = new Promise<void>((res, rej) => { done = res })
    let { wsbase, cgclient } = makeCgClient(testurl)
    addListeners(cgclient, {
      error: errorwsb(wsbase), close: closewsb(wsbase, clients), open: async (ev) => {
        let port = wssPort(wsbase)
        console.log(stime(), `${logMsg} ${clients} open(${port}):`, wsbase.closeState, json(ev))
        await clientRun(cgclient)
        waitClose(wsbase, clients, 500*nc, () => { console.log(stime(this, `.makeClientAndRun: closed`)) })
        done()
      }
    })
    wsbase.log = 1
    cgclient.log = 1
    return pdone
  }
  refJoin(async (wsb, cgc) => {
    await makeClientAndRun()
    await makeClientAndRun()
    waitClose(wsb, 'ref', 3300, (ev) => {
      console.log(stime(this, `.refJoin: closeEv=`), ev)
      setTimeout(() => { listTCPsockets('close ref') }, 300)
    })
  })
}
let x = 1
openAndClose(`testJoin-${x++}`)

