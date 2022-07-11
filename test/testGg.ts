import { argVal, AT, buildURL, className, json, stime } from "@thegraid/common-lib"
import { GgMessage, GgType } from "./GgMessage.js"
import { addEnumTypeString, CgBase, CgClient, CgMessage, GgClient, GgRefMixin, LeaveEvent, pbMessage, readyState, rost, WebSocketBase } from '../src/index.js'
import type { wsWebSocketBase } from '../src/wsWebSocketBase.js'
import { CgBaseForTestGgClient, Listeners, TestGgClient, TestGgRef } from "./testClasses.js"
import { addListeners, closeStream, listTCPsockets, wssPort } from './testFuncs.js'

let host = argVal('host', 'game7', 'X')  // jest-compatible: Xhost game6
let portStr = argVal('port', '8447', 'X'), port = Number.parseInt(portStr)

const echourl = buildURL('wss', host, 'thegraid.com', 8443)   // "wss://game7.thegraid.com:8443"
const servurl = buildURL('wss', host, 'thegraid.com', port)   // "wss://game7.thegraid.com:8447"
const testurl: string = servurl;
const echoserver: boolean = (testurl == echourl) // if echoserver, don't expect server to ACK msgs
const nclients = Number.parseInt(argVal('n', '2', 'X'))
console.log(stime(this, `nclients=${nclients}`))
console.log(stime(this, `Connect to testurl = ${AT.ansiText(['green'],testurl)}`))
const group_name = 'testGroup'


function openAndClose(logMsg = '') {
  let waitClose = (wsb: WebSocketBase<pbMessage, pbMessage>, logmsg = logMsg, wait=100, closer?: (ev)=>void) => {
    let port = wssPort(wsb as wsWebSocketBase<pbMessage, pbMessage>)
    setTimeout(() => closeStream(wsb, `${logmsg}.waitClose(${wait}, ${port}) `), wait, closer)
  }
  let startRef = (onRef: (wsbase, cgbase) => void) => {
    let ggRef = new TestGgRef()
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
      }, (joinAck) => {
        if (!joinAck.success) {
          closeStream(wsbase, logMsg, () => {
            console.log(stime(this, `.joinGroup: wsbase.wsOpen`), wsbase.wsOpen, readyState(wsbase.ws))
          })
        }
        onRef(wsbase, cgbase)
      })
  }

  let joinGame = (ggc: TestGgClient, cgc: CgClient<GgMessage>) => {
    let name = `test${ggc.instId}`
    return ggc.sendAndReceive(() => ggc.send_join(name, {inform: `joinGame`}), (msg) => msg.type == GgType.join)
  }
  let clientRun = async (ggc: TestGgClient, cgc: CgClient<GgMessage>) => {
    let ack0 = await cgc.send_join(group_name)  // join GROUP as client
    if (ack0.success != true) return console.error(stime(this, `.clientRun: join failed:`), ack0.cause)
    let joinMsg = await joinGame(ggc, cgc)      // joinMsg.value -> {client, player, name, roster} ?
    console.log(stime(logMsg, `.clientRun: joinMsg =`), json(joinMsg.toObject()))
  }
  let makeClientAndRun = () => {
    let done, pdone = new Promise<void>((res, rej) => { done = res })
    let ggc = new TestGgClient(), ggId = ggc.logMsg
    let cgbase = ggc.cgbase
    let wsbase = ggc.wsbase
    addListeners(cgbase, ggc.cgl(ggId))
    ggc.connectStack(testurl, async (ev) => {
      let port = wssPort(wsbase)
      console.log(stime(logMsg, `--${ggId} open(${port}):`), wsbase.closeState, wsbase.wsOpen) // json(ev) is cicular
      await clientRun(ggc, cgbase)
      if (cgbase.client_id == 2)
        await cgbase.send_leave(group_name, cgbase.client_id, 'testDone&close', true)
      waitClose(wsbase, ggId, 500 * ggc.instId, () => { console.log(stime(this, `.makeClientAndRun: closed`)) })
      done()
    })
    return pdone
  }
  startRef(async (wsb: wsWebSocketBase<any, any>, cgc) => {
    setTimeout(async () => {
      console.log(stime(`startRef: Now start clients: ${nclients} --------------`))
      for (let n = 0; n < nclients; n++) {
        await makeClientAndRun()
      }
      if (nclients > 0 && wsb.wsOpen) {
        // CgServer auto-closes (client_id==0) Referee; so this should be a no-op:
        waitClose(wsb, 'ref', 3300, (ev) => {
          console.log(stime(this, `.startRef: closeEv=`), ev)
          console.log(stime(this, `.startRef: wsb.wsOpen`), wsb.wsOpen, readyState(wsb.ws))
          setTimeout(() => { listTCPsockets('close ref') }, 300)
        })
      }
    }, 500)
  })
}
openAndClose(`testGg.ts`)

