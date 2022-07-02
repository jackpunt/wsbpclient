import { WebSocketBase, pbMessage, CgMessage, AckPromise, CgBase, CgMessageOpts, CgType, stime, BaseDriver, DataBuf, EzPromise, className, addEnumTypeString } from "./index.js";
import { Rost } from "./GgProto.js";

type Constructor<T = {}> = new (...args: any[]) => T;

/** extract strings from un-deserialized InnerMessage: 
 * 
 * or: use upstream.deserialize()!
 */
function stringData(data: DataBuf<any>) {
  let ary = new Uint8Array(data)
  let k = ary.filter((v: number) => v >= 32 && v < 127)
  return String.fromCharCode(...k)
}
export enum GgType {
  none = 0,
  next = 6, // next player turn
  undo = 7, // request to undo
  join = 8, // join Game (as player, observer, or referee(client_id=0xEF))
  chat = 9, // some info text...
}
/** Generic Game message: join (client_id, player, name, roster), next, undo, chat(inform)... */
export interface GgMessage extends pbMessage { 
  type: GgType | any; // any compatible enum...
  client_from: number;// pseudo field set by wsmesssage: wrapper.client_from
  client: number;     // ref sets { client, player, name }
  player: number; 
  name: string;
  clientto: number;
  roster: Rost[];
  /** type as a string (vs enum value) */
  get msgType(): string
}

// declare module '../proto/GgProto' {
//   interface GgMessage { msgType: string }
// }
/** augment proto with accessor 'msgType => string' */
function ggaddEnumTypeString(msgClass: { prototype: object }, anEnum: any = GgType, accessor = 'msgType') {
  Object.defineProperty(msgClass.prototype, accessor, {
    /** GgMessage.type as a string. */
    get: function () { return anEnum[this.type] }
  })
}

export type rost = {name: string, client: number, player: number}
type GGMK = Exclude<keyof GgMessage, Partial<keyof pbMessage> | "serialize">
export type GgMessageOpts = Partial<Pick<GgMessage, GGMK>>

// try make a Generic GgClient that wraps a CgBase for a given GgMessage/pbMessage type.
// InnerMessage is like: HgMessage or CmMessage: share basic messages:
// CgProto Ack/Nak, send_send, send_join(group); onmessage -> parseEval
// InnerMessage: send_join(name, opts), eval_join(Rost), send_message->send_send, undo?, chat?, param?
// inject a deserializer!
// We extend BaseDriver with the GenericGame proto driver/client, using these methods to talk to CgBase
/** Driver that speaks Generic Game proto above CgClient: players join, take turns, undo... */
export class GgClient<InnerMessage extends GgMessage> extends BaseDriver<GgMessage, never> {
  wsbase: WebSocketBase<pbMessage, pbMessage>;
  cgBase: CgBase<InnerMessage>; // === this.dnstream
  declare deserialize: (buf: DataBuf<InnerMessage>) => InnerMessage
  omc: new (opts: any) => InnerMessage

  maxPlayers: number = 4;
  player_id: number;
  player_name: string
  readonly refid = 239  // 'ef'
  get isPlayer() { return this.player_id < this.maxPlayers}

  /**
   * Create a web socket stack
   * @param ImC InnerMessage class/constructor(opts); With: ImC.deserialize(DataBuf) -> InnerMessage
   * @param CgB CgBase constructor
   * @param WSB WebSocketBase constructor
   * @param url web socket URL
   * @param onOpen callback when webSocket is open: onOpen(this) => void
   */
  constructor(
    //OmD: (buf: DataBuf<InnerMessage>) => InnerMessage,
    ImC: new (opts: any) => InnerMessage,
    CgB: new () => CgBase<InnerMessage> = CgBase,
    WSB: new () => WebSocketBase<pbMessage, CgMessage> = WebSocketBase,
    url?: string,
    onOpen?: (cgClient: GgClient<InnerMessage>) => void) {
    super()
    //if (!Object.hasOwn(OmC.prototype, 'msgType'))
    if (!ImC.prototype.hasOwnProperty('msgType')) 
      addEnumTypeString(ImC, GgType) // Failsafe: msg.msgType => enum{none = 0}(msg.type)
      //ggaddEnumTypeString(ImC) // Failsafe: msg.msgType => enum{none = 0}(msg.type)
    this.omc = ImC
    let deserial = ImC['deserialize'] as ((buf: DataBuf<InnerMessage>) => InnerMessage)
    let deserial0 = (buf: DataBuf<CgMessage>) => {
      try {
        //console.log(stime(this, `.deserialize buf =`), buf)
        return deserial(buf)
      } catch (err) {
        console.error(stime(this, `.deserialize: failed`), stringData(buf), buf, err)
        return undefined // not a useful InnerMessage
      }
    }
    this.deserialize = deserial0
    url && this.connectStack(CgB, WSB, url, onOpen)
  }

  get isOpen() { return !!this.wsbase && this.wsbase.ws && this.wsbase.ws.readyState == this.wsbase.ws.OPEN }

  /** CgBase.ack_promise: Promise with .message from last send_send (or leave, join) 
   * is .resolved when an Ack/Nak is receieved.
   */
  get ack_promise(): AckPromise { return (this.dnstream as CgBase<InnerMessage>).ack_promise}
  get client_id(): number { return this.cgBase.client_id }
  
  // modeled on CgBase.sendToSocket() TODO: integrate into CgBase?
  /** 
   * Promise for last inbound CgType.send message (that expects an Ack)
   * 
   * client must Ack before emitting a new 'send' (that exepect an Ack) 
   */
  message_to_ack: AckPromise = new AckPromise(new CgMessage({type: CgType.none})).fulfill(null);
  
  sendCgAck(cause: string, opts?: CgMessageOpts) {
    if (this.message_to_ack.resolved) {
      // prevent 'spurious ack'
      console.warn(stime(this, `.sendCgAck: duplicate Ack(${cause})`), this.message_to_ack.message)
      return this.message_to_ack
    }
    let rv = this.cgBase.sendAck(cause, opts)
    this.message_to_ack.fulfill(rv.message) // server was waiting for an ACK
    return rv
  }
  sendCgNak(cause: string, opts?: CgMessageOpts) {
    let rv = this.cgBase.sendNak(cause, opts)
    this.message_to_ack.fulfill(rv.message)
    return rv
  }
  /**
   * Send_send via this.outer CgClient [after we Ack the previous inbound request]
   * @param message a GgMessage to be wrapped
   * @param cgOpts -- if not supplied, the default for nocc: is undefined, so ref is not self-copied
   */
  send_message(message: InnerMessage, cgOpts?: CgMessageOpts, ackPromise?: AckPromise): AckPromise {
    // TODO: default cgOpts = { nocc: true }
    // note: sendCgAck() & sendCgNak() are not processed by this code.
    // queue new requests until previous request is ack'd:
    if (!this.message_to_ack.resolved) {
      this.log && console.log(stime(this, `.send_message: need_to_ack`), { message, message_to_ack: this.message_to_ack.message })
      if (!ackPromise) ackPromise = new AckPromise(undefined) // undefined indicates still pending
      this.message_to_ack.then(() => {
        this.send_message(message, cgOpts, ackPromise) // ignore return value (either ackPromise OR .ack_promise)
      })
      return ackPromise // message queued to be sent
    }
    this.cgBase.send_send(message, cgOpts) // sets this.ack_promise === cgClient.ack_promise
    if (!!ackPromise) {
      // if ackPromise is supplied, then add .message and arrange to .fulfill():
      ackPromise.message = this.ack_promise.message // presence of .message indicates CgMessage has been sent
      this.ack_promise.then((ack) => {
        ackPromise.fulfill(ack)
      })
    }
    return this.ack_promise
  }
  /**
   * wire-up this CgDriver to a CgClient and WebSocketBase to the given URL 
   * @param CgB a CgClient Class/constructor
   * @param WSB a WebSocketBase Class/constructor
   * @param url string URL to the target CgServer server
   * @param onOpen invoked when CgB<InMessage>/CgClient/WSB connection to server/URL is Open.
   * @returns this CgDriver
   */
  connectStack(
    CgB: new () => CgBase<InnerMessage>,
    WSB: new () => WebSocketBase<pbMessage, CgMessage>,
    url: string,
    onOpen?: (omDriver: GgClient<InnerMessage>) => void): this 
  {
    let omDriver: GgClient<InnerMessage> = this
    let cgBase = new CgB()
    let wsb: WebSocketBase<pbMessage, CgMessage> = new WSB()
    omDriver.cgBase = cgBase
    omDriver.wsbase = wsb
    omDriver.connectDnStream(cgBase)
    cgBase.connectDnStream(wsb)
    wsb.connectDnStream(url)
    wsb.ws.addEventListener('open', (ev) => onOpen(omDriver))
    return this
  }

  /** 
   * Send GgMessage, get Ack, then wait for a GgMessage that matches predicate.
   * @return promise to be fulfill'd by first message matching predicate.
   * @param sendMessage function to send a message and return an AckPromise
   * @param pred a predicate to recognise the GgMessage response (and fullfil promise)
   */
  sendAndReceive(sendMessage: () => AckPromise, 
    pred: (msg: InnerMessage) => boolean = () => true): EzPromise<InnerMessage> {
    let listenForGgReply =  (ev: MessageEvent<DataBuf<InnerMessage>>) => {
      let ggm = this.deserialize(ev.data)
      if (pred(ggm)) {
        this.log && console.log(stime(this, ".listenForGgReply: fulfill="), ggm)
        this.removeEventListener('message', listenForGgReply)
        ggPromise.fulfill(ggm)
      }
    }
    let ggPromise = new EzPromise<InnerMessage>()
    this.addEventListener('message', listenForGgReply)
    let ackPromise = sendMessage()
    ackPromise.then((ack) => {
      if (!ack.success) { 
        this.removeEventListener('message', listenForGgReply)
        ggPromise.reject(ack.cause) 
      }
    })
    return ggPromise
  }
  /** make a Game-specific 'join' message... */
  make_join(name: string, opts: GgMessageOpts = {}): InnerMessage {
    return new this.omc({ ...opts, name: name, type: GgType.join }) // include other required args
  } 
  /** send Join request to referee.
   * 
   * See also: sendAndReceive() to obtain the response Join fromReferee
   * (which will come to eval_join anyway, with name & player_id)
   */
  send_join(name: string, opts: GgMessageOpts = {}): AckPromise {
    let message = this.make_join(name, opts)
    return this.send_message(message, { client_id: 0 }) // to Referee only.
  }

  /**
   * When Cg 'send' message rec'd: dispatchMessageEvent, deserialize and parseEval
   * Set message.client = wrapper.client_from
   * @param data 
   * @param wrapper the outer pbMessage (CgProto.type == send)
   * @override BaseDriver 
   */
  override onmessage(data: DataBuf<InnerMessage>): void {
    let wrapper = this.wrapper as CgMessage
    this.message_to_ack = new AckPromise(wrapper)
    this.log && console.log(stime(this, `.onmessage: data = `), { data })
    //this.dispatchMessageEvent(data)     // inform listeners
    let message = this.deserialize(data)
    message.client_from = wrapper.client_from // message is from: client_from
    message.clientto = wrapper.client_id // capture the client_to field
    this.log && console.log(stime(this, ".wsmessage:"), message.msgType, message)
    this.parseEval(message)
  }

  override parseEval(message: GgMessage) {
    let type = message.type
    // validate player & srcCont/stack, then:

    switch (type) {
      case GgType.none: { this.eval_none(message); break }
      case GgType.chat: { this.eval_chat(message); break }
      case GgType.join: { this.eval_join(message); break }
      case GgType.undo: { this.eval_undo(message); break }
      case GgType.next: { this.eval_next(message); break }
    }
    // default ACK for everthing:
    if (!this.message_to_ack.resolved) this.sendCgAck(message.msgType)
  }

  /**
   * do nothing, not expected
   */
  eval_none(message: GgMessage) {
    this.sendCgAck("none")
  }
  /** display 'cause' in scrolling TextElement */
  eval_chat(message: GgMessage) {
    this.sendCgAck("chat")
  }

  /** all the known players (& observers: !realPlayer(player)) gg-ref controls. */
  roster: Array<rost> = []
  updateRoster(roster: Rost[]) {
    // convert pb 'Rost' into js 'rost'
    this.roster = roster.map(rost => { let { player, client, name } = rost; return { player, client, name }})
  }
  /** CgClient: when [this or other] client joins Game: update roster */
  eval_join(message: GgMessage) {
    this.log && console.log(stime(this, ".eval_join:"), message)
    if (this.client_id === message.client) {
      this.player_id = message.player
      this.player_name = message.name
    }
    this.updateRoster(message.roster)
    this.log && console.log(stime(this, ".eval_join: roster"), this.roster)
    this.sendCgAck("join")
  }
  /** invoke table.undo */
  eval_undo(message: GgMessage) {
    //this.table.undoIt()
    this.sendCgAck("undo")
  }

  /** invoke table.setNextPlayer(n) */
  eval_next(message: GgMessage) {
    let player = message.player
    //this.table.setNextPlayer(player) // ndx OR undefined ==> -1
    this.sendCgAck("next")
  }
}


class RefGgBase<InnerMessage extends pbMessage> extends CgBase<InnerMessage> {
  /** when Client leaves Group, notify Referee. */
  override eval_leave(message: CgMessage) {
    this.log && console.log(stime(this, ".eval_leave"), message)
    if (className(this.upstream) == 'RefereeBase') { // should be true... who else is using RefGgBase??
      // Hijack eval_leave() to deliver message.client_id
      (this.upstream as CgBase<InnerMessage>).eval_leave(message)
      // could this be done with dnstream.addEventListener(...) ?
    }
    super.eval_leave(message)
  }
}

// GgClient is 'HgClient' or 'CmClient'; so HgRef = new Referee(HgClient)
export function GgRefMixin<InnerMessage extends GgMessage, TBase extends Constructor<GgClient<InnerMessage>>>(Base: TBase) {
  return class RefereeBase extends Base {
    get stage() { return {}} // a stage with no canvas, so stime.anno will show " R" for all log(this)
    isRefereeBase = true
    constructor(...args: any[]) { 
      super(undefined) 
      return
    }
    /**
     * Connect GgReferee to given URL.
     * @param onOpen inform caller that CG connection Stack is open
     * @param onJoin inform caller that GgReferee has joined CG
     * @returns the GgReferee (like the constructor...)
     */
    joinGroup(url: string, group: string, onOpen: (ggClient: GgClient<InnerMessage>) => void, onJoin?: (ack: CgMessage) => void): this {
      // Stack: GgClient=this=GgReferee; CgClient=RefGgBase; WebSocketBase -> url
      this.connectStack(RefGgBase, WebSocketBase, url, (refClient: GgClient<InnerMessage>) => {
        onOpen(refClient)
        refClient.cgBase.send_join(group, 0, "referee").then((ack: CgMessage) => {
          this.log && console.log(stime(this, `.joinGroup: ack =`), ack)
          this.roster.push({ client: ack.client_id, player: this.refid, name: "referee" })
          onJoin && onJoin(ack)
        })
      })
      let dnstream = (this.dnstream as CgBase<GgMessage>) // a [Ref]CgBase
      console.log(stime(this, `.joinGroup: dnstream =`), dnstream)
      return this
    }

    /** special invocation from GgRefBase: somebody wants to leave the Group
     * so we first 'leave' them from the Game.
     */
    eval_leave(msg: CgMessage) {
      let { client_id, cause, group } = msg
      let rindex = this.roster.findIndex(pr => pr.client === client_id)
      let pr: rost = this.roster[rindex]
      // remove from roster, so they can join again! [or maybe just nullify rost.name?]
      if (rindex >= 0) this.roster.splice(rindex, 1)
      this.log && console.log(stime(this, ".eval_leave: roster"), this.roster.concat())
      // QQQQ: should we tell the other players? send_join(roster)
      this.send_roster(pr)  // noting that 'pr' will not appear in roster...
    }

    /** CgReferee: message is request to join GAME, assign Player_ID */
    override eval_join(message: InnerMessage) {
      let client = message.client_from // wrapper.client_from
      let name = message.name, pr: rost
      this.log && console.log(stime(this, ".eval_join"), name, message, this.roster)
      if (message.clientto !== 0) {
        this.sendCgNak("send join to ref only", { client_id: client });
        return;
      }
      if (pr = this.roster.find(pr => (pr.name === message.name))) {
        this.sendCgNak(`name in use: ${message.name}: ${pr.player}`, { client_id: client })
        return
      }
      let player = (() => {
        for (let pid = 0; pid < this.maxPlayers; pid++) {
          if (!this.roster.find(pr => pr.player === pid)) return pid
        }
        // TODO: allow non-player observers
        return undefined
      })()

      if (player === undefined) {
        this.sendCgNak("game full", { client_id: client }) // maybe try join as observer
        return
      }

      // add client/player/name to roster:
      pr = { client, player, name };
      this.roster.push(pr)
      this.log && console.log(stime(this, ".eval_join: roster"), this.roster)

      // send_join(player, roster) to Group, so everyone knows all the players.
      this.sendCgAck("joined", { client_id: client }) // ... not an ACK to tell server to sendToOthers...
      this.log && console.log(stime(this, ".eval_join: assign player"), pr)
      this.send_roster(pr)
    }

    /** send the curent roster
     * @pr {name, client, player} of the requester/joiner; 
     */
    send_roster(pr: rost) {
      let { name, client, player } = pr
      let active = this.roster.filter(pr => pr.client != undefined)
      let roster = active.map(pr => new Rost(pr))
      this.send_join(name, { client, player, roster }) // fromReferee to Group.
    }
    /** send join with roster to everyone. */
    override send_join(name: string, opts: GgMessageOpts = {}): AckPromise {
      let message = this.make_join(name, opts)
      this.log && console.log(stime(this, ".send_join"), message)
      return this.send_message(message, { nocc: true }) // from Referee
    }
  }
}
