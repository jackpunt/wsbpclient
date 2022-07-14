import { AT, json } from "@thegraid/common-lib";
import { CgBase, GgClient, type pbMessage, CgMessage, stime, type WebSocketBase, readyState, LeaveEvent, GgRefMixin, type rost, className, addEnumTypeString } from "../src/index.js";
import { GgMessage, GgType, IGgMessage } from "../src/GgMessage.js";
import { wsWebSocketBase } from "../src/wsWebSocketBase.js";
declare module '../src/GgMessage' {
  interface GgMessage {
    client_from: number // GgReferee expects GgMessage to have a slot for client_from
  }
}
const stime_anno0 = stime.anno;
stime.anno = (obj) => {
  return (obj instanceof TestGgClient) ? (`[${obj.client_id}]` || '[?]') : stime_anno0(obj)
}

export type Listener = (ev: any) => void
export type Listeners = {
  open?: Listener, 
  close?: Listener, 
  error?: Listener, 
  message?: Listener,
  leave?: Listener,
}
export class CgBaseForTestGgClient extends CgBase<GgMessage> {}
export class TestGgClient extends GgClient<GgMessage> {
  static instId = 0
  override cgbase: CgBase<GgMessage>;
  override get wsbase() { return super.wsbase as wsWebSocketBase<pbMessage, CgMessage> }
  constructor(url?: string, onOpen?: (ggC: TestGgClient) => void, CgB = CgBaseForTestGgClient) {
    super(GgMessage, CgB, wsWebSocketBase, url, onOpen) // CgB, WSB
    this.wsbase.log = 0
    this.cgbase.log = 1
  }
  instId = ++TestGgClient.instId
  logMsg = `TestGgClient#${this.instId}`
  errorwsb(wsb, logmsg = this.logMsg) {
    return (ev: any) => {
      console.error(stime(this, `.errorwsb: ${logmsg} ${AT.ansiText(['red'], 'wsb error:')}`), ev, wsb.closeState);
    }
  }
  closewsb(wsb: WebSocketBase<pbMessage, pbMessage>, logmsg = this.logMsg) {
    return (ev) => {
      let { type, wasClean, reason, code } = ev, evs = json({ type, wasClean, reason, code })
      console.log(stime(this, `.closewsb: ${logmsg}`), { ev: evs, state: readyState(wsb.ws), open: wsb.wsOpen })
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
    //console.log(stime(this, `.eval_joinGame:`), message.toObject())
    super.eval_join(message, true)
  }
  override eval_chat(message: IGgMessage) {
    console.log(`eval_chat`, message.msgObject, this.roster)
    console.log(stime(this, `.eval_chat[${this.logMsg}] From ${this.client_roster_name(message.client)}: ${AT.ansiText(['$magenta', 'bold'], message.inform)}`))
    this.sendCgAck("chat")
  }}

export class CgBaseForRef extends CgBase<GgMessage> {
  permRef = true
  /** eval_leave() when a Client has left the Group. */
  override eval_leave(message: CgMessage) {
    console.log(stime(this, ` CgBaseForRef.eval_leave: received message`), message.msgString)
    if (message.client_id === this.client_id && this.permRef) {
      // ref has been offered a chance to leave... 
      // but we would need to assure there is clean handover if a client_join is in flight from server!
      return // simply ignore the offer; we will remain as ref for a while longer.
    }
    super.eval_leave(message) // log; send_leave({...}); leaveClose('toldToLeave')
    // dispatch a 'leave' event to inform upstream driver; leaveGroup --> leaveGame (or whatever)
    // see also: CgServerDriver where ServerSocketDriver('close') --> send(CgMessage(CgType.leave))
    // [which is what we are processing here]
    let { type, client_id, cause, group, nocc } = message
    let event = new LeaveEvent(client_id, cause, group)
    console.log(stime(this, ` CgBaseForRef.eval_leave: dispatching event`), { LeaveEvent: json(event) })
    this.dispatchEvent(event)
  }
  override leaveClose(reason: string): void {
    let ackp = this.ack_promise, ack_value = (ackp.value instanceof CgMessage) ? ackp.value.msgString : 'unresolved'
    console.log(stime(this, ` CgBaseForRef.leaveClose: ack =`), { ack_value, ack_msg: this.ack_message.msgString })
    if (!this.ack_promise.resolved) {
      this.ack_promise.then(() => {
        setTimeout(() => this.leaveClose(reason), 4) // process any queued transactions before closeStream
      })
    } else { super.leaveClose(reason) }
  }
  /** override to log while debugging */
  override eval_ack(ack: CgMessage, req: CgMessage): void {
    console.log(stime(this, ` CgBaseForRef.eval_ack:`), { ack: ack.msgString, req: req.msgString })
    //super.eval_ack(message, req) // super does nothing
  }
}

export class TestGgRef extends GgRefMixin<GgMessage, typeof TestGgClient>(TestGgClient) {
  cgBaseType = CgBase
  constructor(url?: string, onOpen?: ((ggClient: GgClient<GgMessage>) => void), cgBaseC = CgBaseForRef) {
    super(url, (ggC) => {
      onOpen(ggC)
      this.log = 1
      this.cgbase.log = 1
      this.wsbase.log = 1
    }, cgBaseC as typeof CgBase);
    this.cgBaseType = cgBaseC as typeof CgBase // for reference in debugger?
  }
}
