import { GgMessage as GgMessage0, GgType, Rost } from "./GgProto.js";
import { AckPromise, addEnumTypeString, BaseDriver, CgBase, CgMessage, CgMessageOpts, CgType, className, DataBuf, EzPromise, LeaveEvent, pbMessage, stime, WebSocketBase } from "./index.js";

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

/** Generic Game message: join (client_id, player, name, roster), next, undo, chat(name, inform)... 
 */
export interface GgMessage extends pbMessage { 
  type: GgType | any; // message_id: number from compatible enum...
  client: number;     // client_id: from ClientGroup; ref sets { client, player, name }
  player: number;     // player_id: serial #; large values indicate observer or referee (237)
  name: string;       // player name (provide when joining, must be unique w/in the Group)
  roster: Rost[];     // { client: client_id, player: player_id, name: name }
  client_to: number;  // from CgMessage: wrapper.client_id  [referee checks on join]
  inform: string;     // information string for logging/debugging
  /** type as a string (vs enum value) */
  get msgType(): string // typically injected into pbMessage<Ioc extends GgMessage>
  // declare module "src/IoCproto" { interface IoC { msgType: string }}; addEnumTypeString(IoC)
}

/** GgMessage.Rost as object: */
export type rost = { name: string, client: number, player: number }
type GGMK = Exclude<keyof GgMessage, Partial<keyof pbMessage> | "serialize">
export type GgMessageOpts = Partial<Pick<GgMessage, GGMK>>

// try make a Generic GgClient that wraps a CgBase for a given GgMessage/pbMessage type.
// InnerMessage is like: HgMessage or CmMessage: share basic messages:
// CgProto Ack/Nak, send_send, send_join(group); onmessage -> parseEval
// InnerMessage: send_join(name, opts), eval_join(Rost), send_message->send_send, undo?, chat?, param?
// inject a deserializer!
// We extend BaseDriver with the GenericGame proto driver/client, using these methods to talk to CgBase
/** Driver that speaks Generic Game proto above CgBase<GgMessage>: players join, take turns, undo... */
export class GgClient<InnerMessage extends GgMessage> extends BaseDriver<GgMessage, pbMessage> {
  //wsbase: WebSocketBase<pbMessage, pbMessage>;
  cgbase: CgBase<InnerMessage>; // === this.dnstream
  /** Constructor<InnerMessage>(DataBuf) */
  declare deserialize: (buf: DataBuf<InnerMessage>) => InnerMessage

  maxPlayers: number = 4;
  player_id: number;
  player_name: string
  readonly refid = 239  // 'ef'
  get isPlayer() { return this.player_id < this.maxPlayers}

  /**
   * Create a web socket stack
   * @param ImC constructor\<InnerMessage>(opts); With: ImC.deserialize(DataBuf) -> InnerMessage
   * @param CgB CgBase\<InnerMessage> constructor
   * @param WSB WebSocketBase\<pb,Cg> constructor
   * @param url WebSocket URL - when provided: connect wsbase(url).then(onOpen(ggClient))
   * @param onOpen callback when WebSocket is open: onOpen(this) => void
   */
  constructor(
    //OmD: (buf: DataBuf<InnerMessage>) => InnerMessage,
    public ImC: new (opts: any) => InnerMessage,
    public CgB: new () => CgBase<InnerMessage> = CgBase,
    public WSB: new () => WebSocketBase<pbMessage, CgMessage> = WebSocketBase,
    url?: string,
    onOpen?: (ggClient: GgClient<InnerMessage>) => void) {
    super()
    //if (!Object.hasOwn(ImC.prototype, 'msgType'))
    if (!ImC.prototype.hasOwnProperty('msgType')) 
      addEnumTypeString(ImC, GgType) // Failsafe: msg.msgType => enum{none = 0}(msg.type)
    let deserial = ImC['deserialize'] as ((buf: DataBuf<InnerMessage>) => InnerMessage)
    let deserialCatch = (buf: DataBuf<CgMessage>) => {
      try {
        //console.log(stime(this, `.deserialize buf =`), buf)
        return deserial(buf)
      } catch (err) {
        this.ll(0) && console.error(stime(this, `.deserialize: failed`), stringData(buf), buf, err)
        return undefined // not a useful InnerMessage
      }
    }
    this.deserialize = deserialCatch
    this.connectStack(url, onOpen)
  }
  /**
   * Stack this GgClient --> CgBase --> WebSocketBase --> URL 
   * @param url URL to the target CgServer server
   * @param onOpen invoked when GgClient/CgBase/WSB connection to server/URL is Open.
   * @returns this GgClient
   */
  connectStack(url: string, onOpen?: (ggClient: GgClient<InnerMessage>) => void): this  {
    if (!this.cgbase)
      this.cgbase = (this.dnstream || this.connectDnStream(new this.CgB()).dnstream) as CgBase<InnerMessage> 
    let wsbase = this.wsbase || (this.cgbase.connectDnStream(new this.WSB()), this.wsbase)
    if (url) {
      let ggClient = this
      wsbase.connectDnStream(url)
      onOpen && wsbase.ws.addEventListener('open', (ev) => onOpen(ggClient))
    }
    return this
  }

  /** CgBase.ack_promise: Promise with .message from last send_send (or leave, join) 
   * is .resolved when an Ack/Nak is receieved.
   */
  get ack_promise(): AckPromise { return (this.dnstream as CgBase<InnerMessage>).ack_promise}
  get client_id(): number { return this.cgbase.client_id }
  
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
    let rv = this.cgbase.sendAck(cause, opts)
    this.message_to_ack.fulfill(rv.message) // server was waiting for an ACK
    return rv
  }
  sendCgNak(cause: string, opts?: CgMessageOpts) {
    let rv = this.cgbase.sendNak(cause, opts)
    this.message_to_ack.fulfill(rv.message)
    return rv
  }
  /**
   * Send_send via this.dnstream CgBase [after we Ack the previous inbound request]
   * @param message a GgMessage to be wrapped
   * @param cgOpts -- if not supplied, the default for nocc: is undefined, so ref is not self-copied
   */
  send_message(message: InnerMessage, cgOpts?: CgMessageOpts, ackPromise?: AckPromise): AckPromise {
    // TODO: default cgOpts = { nocc: true }
    // note: sendCgAck() & sendCgNak() are not processed by this code.
    // queue new requests until previous request is ack'd:
    if (!this.message_to_ack.resolved) {
      this.ll(1) && console.log(stime(this, `.send_message: need_to_ack`), { message, message_to_ack: this.message_to_ack.message })
      if (!ackPromise) ackPromise = new AckPromise(undefined) // undefined indicates still pending
      this.message_to_ack.then(() => {
        this.send_message(message, cgOpts, ackPromise) // ignore return value (either ackPromise OR .ack_promise)
      })
      return ackPromise // message queued to be sent
    }
    this.cgbase.send_send(message, cgOpts) // sets this.ack_promise === cgClient.ack_promise
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
        this.ll(1) && console.log(stime(this, ".listenForGgReply: fulfill="), ggm)
        this.removeEventListener('message', listenForGgReply)
        ggPromise.fulfill(ggm) // if ack.success && pred(ggm) ??
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
    return new this.ImC({ ...opts, client_from: this.client_id, name: name, type: GgType.join }) // include other required args
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
    this.ll(1) && console.log(stime(this, `.onmessage: data = `), { data })
    let message = this.deserialize(data)
    if (!message) {
      console.warn(stime(this, `.onmessage: ignore message from wrapper`), wrapper)
      let opts: GGMK = undefined
      this.sendCgNak('message invalid', { info: wrapper.msgType })
      return
    }
    message.client = wrapper.client_from // message is from: wrapper.client_from
    message.client_to = wrapper.client_id // capture the client_id field
    this.ll(1) && console.log(stime(this, ".wsmessage:"), message.msgType, message)
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
      default: {
        // if subclass does not override, still try to invoke their method!
        ;(this[`eval_${message.msgType}`] as Function).call(this, message)
      }
    }
    // if not already ACK'd:
    if (!this.message_to_ack.resolved) {
      this.ll(1) && console.log(stime(this, `.parseEval: sendCgAck('${message.msgType}') for message`), message)
      this.sendCgAck(message.msgType)
    }
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
  /** GgClient: when [this or other] client joins/leaves Game: update roster */
  eval_join(message: GgMessage) {
    this.ll(1) && console.log(stime(this, ".eval_joinGame:"), message)
    if (this.client_id === message.client) {
      this.player_id = message.player
      this.player_name = message.name
    }
    this.updateRoster(message.roster)
    this.ll(1) && console.log(stime(this, ".eval_joinGame: roster"), this.roster)
    this.sendCgAck("joinGame")
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

/** 
 * Add GgReferee functionality to a GgClient<GgMessage> (expect a dnstream CgBase Driver) 
 * 
 * Eg: class HgReferee extends GgRefMixin<HgMessage, HgClient>(HgClient) {}
 */
export function GgRefMixin<InnerMessage extends GgMessage, TBase extends Constructor<GgClient<InnerMessage>>>(Base: TBase) {
  return class RefereeBase extends Base {
    get stage() { return {}} // a 'stage' with no canvas, so stime.anno will show " R" for all log(this)
    /** GgRefMixin.RefereeBase() */
    constructor(...args: any[]) { 
      super(...args) 
      return
    }
    /**
     * Connect GgRefMixin to given URL.
     * @param onOpen inform caller that CG connection Stack is open
     * @param onJoin inform caller that GgReferee has joined CG
     * @returns the GgRefMixin (like the constructor...)
     */
    joinGroup(url: string, group: string, onOpen: (ggClient: GgClient<InnerMessage>) => void, onJoin?: (ack: CgMessage) => void): typeof this {
      // Stack: GgClient=this=GgReferee; CgBase=RefGgBase; WebSocketBase -> url
      this.connectStack(url, (refClient: GgClient<InnerMessage>) => {
        onOpen(refClient)
        refClient.cgbase.send_join(group, 0, "referee").then((ack: CgMessage) => {
          this.ll(1) && console.log(stime(this, `.joinGroup: ack =`), ack)
          this.roster.push({ client: ack.client_id, player: this.refid, name: "referee" })
          onJoin && onJoin(ack)
        })
      })
      let dnstream = (this.dnstream as CgBase<GgMessage>) // a [Ref]CgBase
      dnstream.addEventListener('leave', (msg) => this.client_leave(msg))
      console.log(stime(this, `.joinGroup: dnstream =`), this.isBrowser ? dnstream : className(dnstream))
      return this
    }

    /** listener for LeaveEvent, from dnstream: CgReferee */
    client_leave(event: Event | LeaveEvent) {
      this.ll(2) && console.log(stime(this, ".client_leave:"), event)
      let { client_id, cause, group } = event as LeaveEvent
      let rindex = this.roster.findIndex(pr => pr.client === client_id)
      let pr: rost = this.roster[rindex]
      // remove from roster, so they can join again! [or maybe just nullify rost.name?]
      if (rindex >= 0) this.roster.splice(rindex, 1)
      this.ll(1) && console.log(stime(this, `.client_leave: ${group}; roster =`), this.roster.concat())
      // tell the other players: send_join(roster)
      this.send_roster(pr, 'leaveGame')  // noting that 'pr' will not appear in roster...
    }

    /** player_id of given client_id (lookup from roster) */
    player_index(client_id: number) {
      let rost = this.roster.find(pr => pr.client === client_id)
      return !!rost ? rost.player : undefined    
    }

    /** GgRefMixin.RefereeBase: message is request to join GAME, assign Player_ID */
    override eval_join(message: InnerMessage) {
      let client = message.client // wrapper.client_from
      let name = message.name, pr: rost
      this.ll(1) && console.log(stime(this, ".eval_joinGame"), name, message, this.roster.concat())
      if (message.client_to !== 0) {
        this.sendCgNak("send joinGame to ref only", { client_id: client });
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
      this.ll(1) && console.log(stime(this, ".eval_join: roster"), this.roster.concat())
      // send Ack to the client, completing the 'join' transaction
      this.sendCgAck("joined", { client_id: client }) // ... not an ACK to tell Server to sendToOthers...
      this.ll(1) && console.log(stime(this, ".eval_join: assign player"), pr)

      // send_join(rost(player)) to Group, so everyone knows all the players.
      this.send_roster(pr)
    }

    /** send new/departed player's name, client, player in a 'join' Game message;
     * - all players update their roster using included roster: Rost[]
     * @pr {name, client, player} of the requester/joiner; 
     * @param info CgMessageOpts = { info }
     */
    send_roster(pr: rost, info = 'joinGame') {
      let { name, client, player } = pr
      let active = this.roster.filter(pr => pr.client != undefined)
      let roster = active.map(pr => new Rost(pr))
      this.send_join(name, { client, player, roster }, { info }) // fromReferee to Group.
    }
    /** send join with roster to everyone. */
    override send_join(name: string, opts: GgMessageOpts = {}, cgOpts: CgMessageOpts = {}): AckPromise {
      let message = this.make_join(name, opts)
      this.ll(1) && console.log(stime(this, ".send_joinGame"), message)
      return this.send_message(message, { nocc: true, ...cgOpts }) // from Referee
    }
  }
}
