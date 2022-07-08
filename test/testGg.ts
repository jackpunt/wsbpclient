import { argVal, AT, buildURL, className, json, stime } from "@thegraid/common-lib"
import { GgMessage, GgType } from "../src/GgProto.js"
import { addEnumTypeString, CgBase, CgClient, CgMessage, GgClient, GgRefMixin, LeaveEvent, pbMessage, readyState, rost, WebSocketBase } from '../src/index.js'
import { wsWebSocketBase } from '../src/wsWebSocketBase.js'
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

class CgBaseForTestGgClient extends CgBase<GgMessage> {}
class TestGgClient extends GgClient<GgMessage> {
  static instId = 0
  override cgbase: CgBase<GgMessage>;
  override get wsbase() { return super.wsbase as wsWebSocketBase<pbMessage, CgMessage> }
  constructor(url?: string, onOpen?: (ggC: TestGgClient) => void, CgB = CgBaseForTestGgClient) {
    super(GgMessage, CgB, wsWebSocketBase, url, onOpen) // CgB, WSB
    this.wsbase.log = 0
    this.cgbase.log = 1
  }
  instId = ++TestGgClient.instId
  logMsg = `TestGg-${this.instId}`
  errorwsb(wsb, logmsg = this.logMsg) {
    return (ev: any) => {
      console.error(stime(this, `errorwsb: ${logmsg} ${AT.ansiText(['red'], 'wsb error:')}`), ev, wsb.closeState);
    }
  }
  closewsb(wsb: WebSocketBase<pbMessage, pbMessage>, logmsg = this.logMsg) {
    return (ev) => {
      let { type, wasClean, reason, code } = ev, evs = json({ type, wasClean, reason, code })
      console.log(stime(this, `.closewsb: ${logmsg}`), { ev: evs, state: readyState(wsb.ws) })
    }
  }
  cgl(logMsg = this.logMsg, more: Listeners = {}): Listeners {
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

class CgBaseForRef extends CgBase<GgMessage> {
  /** eval_leave() when a Client has left the Group. */
  override eval_leave(message: CgMessage) {
    console.log(stime(this, ` CgBaseForRef.eval_leave: received message`), message)
    console.log(stime(this, ` CgBaseForRef.eval_leave: ack_promise`), this.ack_promise, this.ack_message)

    setTimeout(() => {
      // NEXT TICK! allow ourselves to process the inbound Ack(send_done) from last roster send
      super.eval_leave(message) // log; maybe closeStream('toldToLeave')
      // dispatch a 'leave' event to inform upstream driver; leaveGroup --> leaveGame (or whatever)
      // see also: CgServerDriver where ServerSocketDriver('close') --> send(CgMessage(CgType.leave))
      // [which is what we are processing here]
      let { type, client_id, cause, group, nocc } = message
      let event = new LeaveEvent(client_id, cause, group)
      console.log(stime(this, ` CgBaseForRef.eval_leave: dispatching event`), event)
      this.dispatchEvent(event)
    }, 4);
  }
  /** override to log while debugging */
  override eval_ack(message: CgMessage, req: CgMessage): void {
    console.log(stime(this, ` CgBaseForRef.eval_ack:`), { msg: message.msgObject, req: req.msgObject })
    //super.eval_ack(message, req) // super does nothing
  }
}
class TestGgRef extends GgRefMixin<GgMessage, typeof TestGgClient>(TestGgClient) {
  cgBaseType = CgBase
  constructor(url?: string, onOpen?: ((ggClient: GgClient<GgMessage>) => void), cgBaseC = CgBaseForRef) {
    super(url, (ggC) => {
      onOpen(ggC)
      this.log = 1
      this.cgbase.log = 1
      this.wsbase.log = 1
      this.cgbase.addEventListener('leave', (ev) => {
        this.client_leave(ev as unknown as LeaveEvent) // handled in GgRefMixin.RefereeBase
    })
    }, cgBaseC as typeof CgBase);
    this.cgBaseType = cgBaseC as typeof CgBase
  }    /** listener for LeaveEvent, from dnstream: CgReferee */
    override client_leave(event: Event | LeaveEvent) {
      let { client_id, cause, group } = event as LeaveEvent
      this.ll(0) && console.log(stime(this, ".client_leave:"), { client_id, cause, group })
      let rindex = this.roster.findIndex(pr => pr.client === client_id)
      let pr: rost = this.roster[rindex]
      // remove from roster, so they can join again! [or maybe just nullify rost.name?]
      if (rindex >= 0) this.roster.splice(rindex, 1)
      this.ll(0) && console.log(stime(this, `.client_leave: ${group}; roster =`), this.roster.concat())
      // tell the other players: send_join(roster)
      this.send_roster(pr, 'leaveGameRoster')  // noting that 'pr' will not appear in roster...
    }
    override joinGroup(url: string, group: string, onOpen: (ggClient: GgClient<GgMessage>) => void, onJoin?: (ack: CgMessage) => void): typeof this {
      // Stack: GgClient=this=GgReferee; CgClient=RefGgBase; WebSocketBase -> url
      this.connectStack(url, (refClient: GgClient<GgMessage>) => {
        onOpen(refClient)
        refClient.cgbase.send_join(group, 0, "referee").then((ack: CgMessage) => {
          this.ll(1) && console.log(stime(this, `.joinGroup: ack =`), ack)
          this.roster.push({ client: ack.client_id, player: this.refid, name: "referee" })
          onJoin && onJoin(ack)
        })
      })
      let dnstream = (this.dnstream as CgBase<GgMessage>) // a [Ref]CgBase
      dnstream.addEventListener('leave', (msg) => this.client_leave(msg))
      console.log(stime(this, `.joinGroup: dnstream =`), className(dnstream))
      return this
    }
  }

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
    console.log(stime(logMsg, `.clientRun: joinMsg =`), joinMsg)
  }
  let makeClientAndRun = () => {
    let done, pdone = new Promise<void>((res, rej) => { done = res })
    let ggc = new TestGgClient(), ggId = ggc.logMsg
    let cgbase = ggc.cgbase
    let wsbase = ggc.wsbase
    addListeners(cgbase, ggc.cgl(ggId))
    ggc.connectStack(testurl, async (ev) => {
      let port = wssPort(wsbase)
      console.log(stime(logMsg), `--${ggId} open(${port}):`, wsbase.closeState) // json(ev) is cicular
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
      console.log(stime('startRef: Now start clients'))
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
let x = 1
openAndClose(`testGg-${x++}`)

