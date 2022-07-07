import { argVal, AT, buildURL, json, stime } from "@thegraid/common-lib"
import { GgMessage, GgType } from "../src/GgProto.js"
import { AckPromise, addEnumTypeString, CgBase, CgClient, CgMessage, CgMessageOpts, GgClient, GgMessageOpts, GgRefMixin, LeaveEvent, pbMessage, readyState, WebSocketBase } from '../src/index.js'
import { wsWebSocketBase } from '../src/wsWebSocketBase.js'
import { addListeners, closeStream, listTCPsockets, wssPort } from './testFuncs.js'

let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8447', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const servurl = buildURL('wss', host, 'thegraid.com', port)   // "wss://game7.thegraid.com:8447"
const testurl: string = servurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, don't expect server to ACK msgs
console.log(stime(this, `Connect to testurl = ${AT.ansiText(['green'],testurl)}`))
const group_name = 'testGroup'

type Listener = (ev: any) => void
type Listeners = {
  open?: Listener, 
  close?: Listener, 
  error?: Listener, 
  message?: Listener,
  leave?: Listener,
}
declare module '../src/GgProto' {
  interface GgMessage {
    msgType: string
    client_from: number // GgReferee expects GgMessage to have a slot for client_from
  }
}
addEnumTypeString(GgMessage, GgType)
class TestGgClient extends GgClient<GgMessage> {
  static instId = 0
  override cgbase: CgBase<GgMessage>;
  override wsbase: wsWebSocketBase<pbMessage, CgMessage>
  constructor(url: string, listeners?: Listeners) {
    super(GgMessage, CgBase, wsWebSocketBase, url) // CgB, WSB
    this.wsbase.log = 0
    this.cgbase.log = 0
    this.addListeners(listeners)
  }
  instId = ++TestGgClient.instId
  logMsg = `TestGg-${this.instId}`
  errorwsb(wsb, logmsg = this.logMsg) {
    return (ev: any) => { // dubious binding of 'wsb'...
      console.error(stime(undefined, `errorwsb: ${logmsg} ${AT.ansiText(['red'], 'wsb error:')}`), ev, wsb.closeState);
    }
  }
  closewsb(wsb: WebSocketBase<pbMessage, pbMessage>, logmsg = this.logMsg) {
    return (ev) => {
      let { type, wasClean, reason, code } = ev, evs = json({ type, wasClean, reason, code })
      console.log(stime(undefined, `closewsb: ${logmsg}`), { ev: evs, state: readyState(wsb.ws) })
    }
  }
  cgl(logMsg = this.logMsg, more: Listeners): Listeners {
    return {
      error: this.errorwsb(this.wsbase, logMsg),
      close: this.closewsb(this.wsbase, logMsg), 
      ...more
     }
  }
  addListeners(listeners: Listeners = {}) {
    listeners.open && this.addEventListener('open', listeners.open)
    listeners.close && this.addEventListener('close', listeners.close)
    listeners.error && this.addEventListener('error', listeners.error)
    listeners.message && this.addEventListener('message', listeners.message)
    listeners.leave && this.addEventListener('leave', listeners.leave)
  }
  override eval_join(message: GgMessage): void {
    console.log(stime(this, `.eval_joinGame:`), { message })
    super.eval_join(message)
  }
}
class TestGgRef extends GgRefMixin<GgMessage, typeof TestGgClient>(TestGgClient) {
  
}

function openAndClose(logMsg = '') {
  let waitClose = (wsb: WebSocketBase<pbMessage, pbMessage>, logmsg = logMsg, wait=100, closer?: (ev)=>void) => {
    let port = wssPort(wsb as wsWebSocketBase<pbMessage, pbMessage>)
    setTimeout(() => closeStream(wsb, `${logmsg}.waitClose(${wait}, ${port}) `), wait, closer)
  }
  let startRef = (onRef: (wsbase, cgbase) => void) => {
    let ggRef = new TestGgRef(undefined)
    let cgbase = ggRef.cgbase
    let wsbase = ggRef.wsbase
    addListeners(cgbase, ggRef.cgl('ref', {
      leave: (ev: LeaveEvent) => {
        ggRef.client_leave(ev) // handled in GgRefMixin.RefereeBase
      }
    }))
    ggRef.joinGroup(testurl, group_name,
      async (openGgc) => {
        console.log(stime('ref.joinGroup', `.open: wssPort=`), wssPort(wsbase))
      }, (joinAck) => onRef(wsbase, cgbase))
  }

  let joinGame = (ggc: TestGgClient, cgc: CgClient<GgMessage>) => {
    let name = `test${ggc.instId}`
    return ggc.sendAndReceive(() => ggc.send_join(name, {inform: `joinGame`}), (msg) => msg.type == GgType.join)
  }
  let clientRun = async (ggc: TestGgClient, cgc: CgClient<GgMessage>) => {
    let ack0 = await cgc.send_join(group_name)  // join GROUP as client
    if (ack0.success != true) return console.error(stime(this, `.clientRun: join failed:`), ack0.cause)
    let joinMsg = await joinGame(ggc, cgc)      // joinMsg.value -> {client, player, name, roster} ?
    console.log(stime(this, `.clientRun: joinMsg =`), joinMsg)
  }
  let makeClientAndRun = () => {
    let done, pdone = new Promise<void>((res, rej) => { done = res })
    let ggc = new TestGgClient(undefined), ggId = ggc.logMsg
    let cgbase = ggc.cgbase
    let wsbase = ggc.wsbase
    addListeners(cgbase, ggc.cgl(ggId, {
      open: async (ev) => {
        let port = wssPort(wsbase)
        console.log(stime(), `${logMsg} ${ggId} open(${port}):`, wsbase.closeState, json(ev))
        await clientRun(ggc, cgbase)
        if (cgbase.client_id == 2)
          await cgbase.send_leave(group_name, cgbase.client_id, 'testDone&close', true)
        waitClose(wsbase, ggId, 500 * ggc.instId, () => { console.log(stime(this, `.makeClientAndRun: closed`)) })
        done()
      }
    }))
    ggc.connectStack(testurl)
    return pdone
  }
  startRef(async (wsb, cgc) => {
    setTimeout(async () => {
      console.log(stime('startRef: Now start clients'))
      await makeClientAndRun()
      await makeClientAndRun()
      // CgServer auto-closes (client_id==0) Referee; so this should be a no-op:
      waitClose(wsb, 'ref', 3300, (ev) => {
        console.log(stime(this, `.startRef: closeEv=`), ev)
        setTimeout(() => { listTCPsockets('close ref') }, 300)
      })
    }, 500)
  })
}
let x = 1
openAndClose(`testGg-${x++}`)

