import { AT, json } from "@thegraid/common-lib";
import { CgBase, GgClient, type pbMessage, CgMessage, stime, type WebSocketBase, readyState, LeaveEvent, GgRefMixin, type rost, className } from "../src/index.js";
import { GgMessage } from "../src/GgProto.js";
import { wsWebSocketBase } from "../src/wsWebSocketBase";

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
  logMsg = `TestGg-${this.instId}`
  errorwsb(wsb, logmsg = this.logMsg) {
    return (ev: any) => {
      console.error(stime(this, `errorwsb: ${logmsg} ${AT.ansiText(['red'], 'wsb error:')}`), ev, wsb.closeState);
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
}

export class CgBaseForRef extends CgBase<GgMessage> {
  /** eval_leave() when a Client has left the Group. */
  override eval_leave(message: CgMessage) {
    console.log(stime(this, ` CgBaseForRef.eval_leave: received message`), message.msgObject(true))
    if (message.client_id === this.client_id) {
      // ref has been offered a chance to leave... 
      // but we would need to assure there is clean handover if a client_join is in flight from server!
    //  return // simply ignore the offer; we will remain as ref for a while longer.
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
    let ackp = this.ack_promise, ack_value = (ackp.value instanceof CgMessage) ? ackp.value.msgObject(true) : 'unresolved'
    console.log(stime(this, ` CgBaseForRef.leaveClose: ack =`), { ack_value, ack_msg: this.ack_message.msgObject(true) })
    if (!this.ack_promise.resolved) {
      this.ack_promise.then(() => {
        setTimeout(() => this.leaveClose(reason), 4) // process any queued transactions before closeStream
      })
    } else { super.leaveClose(reason) }
  }
  /** override to log while debugging */
  override eval_ack(ack: CgMessage, req: CgMessage): void {
    console.log(stime(this, ` CgBaseForRef.eval_ack:`), { ack: ack.msgObject(true), req: req.msgObject(true) })
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
      this.cgbase.addEventListener('leave', (ev) => {
        this.client_leave(ev as unknown as LeaveEvent) // handled in GgRefMixin.RefereeBase
    })
    }, cgBaseC as typeof CgBase);
    this.cgBaseType = cgBaseC as typeof CgBase
  }
    /** listener for LeaveEvent, from dnstream: CgReferee */
    override client_leave(event: Event | LeaveEvent) {
      let { client_id, cause, group } = event as LeaveEvent
      this.ll(0) && console.log(stime(this, ".client_leave:"), { client_id, cause, group })
      let rindex = this.roster.findIndex(pr => pr.client === client_id)
      let pr: rost = this.roster[rindex]
      // remove from roster, so they can join again! [or maybe just nullify rost.name?]
      if (rindex >= 0) this.roster.splice(rindex, 1)
      this.ll(0) && console.log(stime(this, `.client_leave: ${group}; send_roster =`), this.roster.concat())
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
