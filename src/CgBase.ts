import { json } from "@thegraid/common-lib";
import { BaseDriver, WebSocketBase } from "./BaseDriver.js";
import { CgMessage, CgMessageOpts, CgType } from "./CgMessage.js";
import { className, CLOSE_CODE, DataBuf, EzPromise, pbMessage, stime, WebSocketDriver } from "./types.js";

/** a DOM event of type 'leave'. emit when (for ex) dnstream.close */
export class LeaveEvent extends Event {
  constructor(public client_id: number, public cause?: string, public group?: string) {
    super(CgType[CgType.leave])
  }
}

// https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation

//    
function charString(char) { return (char >= 32 && char < 127) ? String.fromCharCode(char) : `\\${char.toString(10)}`}


// export type ParserFactory<INNER extends pbMessage, OUTER extends CgMessage> 
//    = (cnx: CgBaseCnx<INNER, OUTER>) => PbParser<INNER>;

// use { signature } to define a type; a class type using { new(): Type }
//function create<Type>(c: { new (): Type }): Type { return new c(); }

/** 
 * EzPromise\<CgMessage> which holds the actual message that was sent.  
 * If (!this.message.expectsAck) then 
 *    (AckPromise.resolved && AckPromise.value) === undefined
 */
export class AckPromise extends EzPromise<CgMessage> {
  constructor(public message: CgMessage, def?: (fil: (value: CgMessage | PromiseLike<CgMessage>) => void, rej: (reason?: any) => void) => void) {
    super(def)
  }
}

/**
 * Implement the base functiunality for the CgProto (client-group) Protocol.
 * BaseDriver\<I extends CgMessage, O extends pbMessage>>
 */
export class CgBase<O extends pbMessage> extends BaseDriver<CgMessage, O> 
  implements WebSocketDriver<CgMessage, pbMessage> {
  
  /** make new CgMessage() ensuring that client_from is set. */
  makeCgMessage(msgOpts: CgMessageOpts) {
    msgOpts.client_from = this.client_id // client_id if join'd as member of a ClientGroup
    return new CgMessage(msgOpts)
  }
  /** group from Ack of join() */
  group_name: string;  // group to which this connection is join'd
  /** client_id from Ack of join() */
  client_id: number;   // my client_id for this group.

  /** used in parseEval logging, override in CgServerDriver */
  get client_port(): string | number { return (this.client_id === undefined) ? 'no_client_id' : this.client_id }

  // this may be tricky... need to block non-ack from any client with outstanding ack
  // (send them an immediate nak) in CgServerDriver
  /** 
   * Promise for last outbound message that expects an Ack.
   * private, but .resolved and .message are accessible:  
   */
  private promise_of_ack: AckPromise = new AckPromise(this.makeCgMessage({type: CgType.none})).fulfill(null);
  get ack_promise(): AckPromise { return this.promise_of_ack } // read-only for debugging CgServerDriver
  /** true if last outbound request has been Ack'd */
  get ack_resolved(): boolean { return this.promise_of_ack.resolved }
  get ack_message(): CgMessage { return this.promise_of_ack.message }
  get ack_message_type(): string { return this.promise_of_ack.message.msgType }
  
  override deserialize(bytes: DataBuf<CgMessage>): CgMessage  {
    return CgMessage.deserialize(bytes)
  }
  /** 
   * parseEval(message = this.deserialize(data))
   * 
   * IFF send_send(data.msg) --> this.upstream.wsmessage(data.msg)
   * @param data DataBuf containing \<CgMessage>
   * @override BaseDriver
   */
  override onmessage(data: DataBuf<CgMessage>) {
    super.onmessage(data) // logData(data)
    this.parseEval(this.deserialize(data))
  }
  override logData(data: DataBuf<CgMessage>): {} | string {
    //let str = this.stringData(data)
    let msg = this.deserialize(data)
    if (msg == undefined) return { msgObj: 'deserialize failed' }
    //let msgType = msg.msgType // msgType may be undefined 
    //let ary = msg?.['array']?.toString()
    let msgObj = msg.msgString       //, toObj = msg?.toObject()
    if (msg.has_msg) {
      let idata = msg.msg as DataBuf<O>
      let ups = (this.upstream as BaseDriver<O, never>)
      let imsg = ups?.deserialize(idata)
      return (imsg == undefined) ? 'no upstream.deserialize(imsg)' : ups.msgToString(imsg)
    }
    return { msgObj }
  }

  override msgToString(message: CgMessage): string {
    return message.msgString
  }
  
  /**
   * @param ev
   * @override
   */
  override onerror(ev: ErrorEvent) {
    super.onerror(ev)    // maybe invoke sentError(ev)
    this.promise_of_ack.reject(`CgBase.onerror(${ev})`)  // if not already resolved...
  }
  /**
   * 
   * @param ev 
   * @override
   */
  override onclose(ev: CloseEvent) {
    this.ll(1) && console.log(stime(this, " CgBase.onclose:"), {code: ev.code, reason: ev.reason, wasClean: ev.wasClean})
    this.promise_of_ack.reject(`CgBase.onclose(${ev.reason})`)
    super.onclose(ev) // send to upstream.onclose(ev)
  }
  // opts?: Exclude<CgMessageOpts, "cause" | "type">
  /** extract useful Opts from Ack/Nak (or any CgMessage), reduce AckMessage to CgMessageOpts. */
  ackOpts(opts: CgMessageOpts): CgMessageOpts {
    if (opts instanceof CgMessage) {
      let { client_id, success, client_from, info, ident } = opts;
      return { client_id, success, client_from, info, ident }
    }
    return opts
  }
  /**
   * this.sendToSocket(new Ack(success: true), ...opts)
   * @param cause string
   * @param opts optional CgMessageOpts | CgMessage
   * @return AckPromise (ackPromise.value is undefined)
   */
  sendAck(cause: string, opts?: CgMessageOpts): AckPromise {
    let ack = this.makeCgMessage({ success: true, ...this.ackOpts(opts), cause, type: CgType.ack })
    return this.sendToSocket(ack) // sendAck
  }
  /**
   * this.sendToSocket(new Ack(success: false), ...opts)
   * @param cause 
   * @param opts CgMessageOpts | CgMessage
   * @returns 
   */
  sendNak(cause: string, opts?: CgMessageOpts) {
    let nak = this.makeCgMessage({ success: false, ...this.ackOpts(opts), cause, type: CgType.ack })
    return this.sendToSocket(nak) // sendNak
  }

  /** debugging utility */
  innerMessageString(m: CgMessage): string {
    // assert: msg defined ONLY for m.msgType=='send' && 'ack'; m.msg[1] is the INNER type
    // but we don't have the deserializer to inspect it [!unless! upstream has a 'deserial' method?]
    // Hmm... if(m) then !!m.msgStr; so the || branch is likely never invoked
    return m && (m.msgStr || `${m.msgType}(${m.cause || m.success || m.group})`)
  }

  /** 
   * If message.expectsAck [Wait for this.ack_promise, then]
   * sendBufer(message) downstream, toward websocket. 
   * 
   * @param message to be serialized and sent dnstream
   * @return AckPromise(message):  
   * .reject(reason) if there is an error while sending (eg: socket is closed) 
   * .fulfill(ackMsg) when Ack/Nak for CgType: join, leave, send is received  
   * .fulfill(undefined) if !message.expectsAck
   */
  sendToSocket(message: CgMessage) {
    return this.sendToSocket_ack(message, undefined)
  }
  /** initial invocation with ackPromise=undefined; if 'defer' then re-call with AckPromise. */
  sendToSocket_ack(message: CgMessage, ackPromise: AckPromise = new AckPromise(message)): AckPromise {
    if ((message.expectsAck && !this.ack_resolved)) {
      // queue this message for sending when current message is ack'd:
      this.ll(1) && console.log(stime(this, `.sendToSocket[${this.client_id}] defer=`), { msgStr: this.innerMessageString(message), to_resolve: this.ack_message?.msgString })
      // provide a rejection handler in case our socket closes before the message is ack'd
      ackPromise.then(undefined, (reason) => {
        this.ll(-1) && console.warn(stime(this, `.sendToSocket[${this.client_id}] deferred1 p_ack.rejected(${reason})`))
      })
      // when current ack_promise/message is resolved, then try send new message:
      // this.ack_promise may have a longish list of 'then' invocations... 
      // TODO is it better: this.ack_promise = this.ack_promise.then((ack) => {...})? chaining/stacking the Promises?
      // would also need to 'pop' a new value into this.ack_promise?
      this.ack_promise.then((ack) => {
        // the message may be nak'd by the recipient; handled by eval_nak() or other .then() clauses
        this.ll(1) && console.log(stime(this, `.sendToSocket[${this.client_id}] refer=`), { msgStr: this.innerMessageString(message), msgType: message.msgType })
        this.sendToSocket_ack(message, ackPromise) // send if ack.success or not
      }, (reason) => {
        this.ll(-1) && console.warn(stime(this, `.sendToSocket[${this.client_id}] deferred2 p_ack.rejected(${reason})`))
        // expect ack_promise is *rejected* only by onclose(); so drop all deferred sendToSocket
      })
      return ackPromise  // with message un-sent
    }
    // TODO: reimplement so this does something useful: this.dnstream.onerror => () => reject_on_error() ??
    const reject_on_error = (error: Error | Event) => {
      ackPromise.reject((error as Error).message || (error as Event).type)
    }

    const bytes = message.serializeBinary()
    this.sendBuffer(bytes) // send message to socket

    if (message.expectsAck) {
      this.promise_of_ack = ackPromise // Ack for the most recent message.expectsAck()
      this.ll(1) && console.log(stime(this, `.sendToSocket[${this.client_id}] p_ack.message =`), ackPromise.message.msgString)
      // handle ack by Promise, not eval_ack:
      ackPromise.then((ack: CgMessage) => {
        this.ll(1) && console.log(stime(this, `.sendToSocket[${this.client_id}] done: p_ack.filled(${ack.msgString})`))
      }, (reason) => {
        this.ll(-1) && console.warn(stime(this, `.sendToSocket[${this.client_id}] done: p_ack.rejected(${reason})`))
      }).catch((reason) => {
        this.ll(-1) && console.warn(stime(this, `.sendToSocket[${this.client_id}] done: p_ack.catch(${reason})`))
      })
    } else {
      ackPromise.fulfill(undefined)    // no Ack is coming
    }
    // console.log(stime(this, ".sendToSocket:"), message.cgType, {message, ackPromise})
    return ackPromise   // with message sent
  }
  /**
   * send a useless "none" message.
   * @param group 
   * @param client_id destination target client or undefined for the whole Group
   * @param cause 
   * @return AckPromise
   */
  send_none(group?: string, client_id?: number, cause?: string): AckPromise {
    let message = this.makeCgMessage({ type: CgType.none, group: group, client_id, cause })
    let promise = this.sendToSocket(message) // send_none
    return promise
  }

  /**
   * send message from upstream to downstream
   * @param message Object containing pbMessage\<INNER>
   * @param opts  
   * client_id: 0 is ref, [null is to Group]  
   * nocc: true to prevent copy back, [false is cc to sender]  
   */
  send_send(message: O, opts?: CgMessageOpts): AckPromise {
    let msg = message.serializeBinary()
    let cgmsg: CgMessage = this.makeCgMessage({...opts, type: CgType.send, msg })
    let promise = this.sendToSocket(cgmsg) // send_send
    return promise
  }
  /**
   * send_join client makes a connection to server group
   * @param group group name
   * @param client_id specify 0 to register as referee; else undefined
   * @param cause specify 'referee' to register as referee;
   * specify 'new' to start a new group (\`${group}NNNN\`); else undefined
   * @returns a Promise that completes when an Ack/Nak is recieved
   */
  send_join(group: string, client_id?: number, cause?: string): AckPromise {
    let message = this.makeCgMessage({ type: CgType.join, group, client_id, cause })
    let promise = this.sendToSocket(message) // send_join
    this.ll(2) && console.log(stime(this, ".send_join:"), "promise=", promise, "then=", promise.then)
    promise.then((ack) => {
      this.ll(2) && console.log(stime(this, `.send_join:`), "ack=", ack.msgString)
      this.group_name = ack.group
      this.client_id = ack.client_id
    }, (rej: any) => {
      this.ll(1) && console.log(stime(this, ".send_join:"), "rej=", rej)
    })
    promise.catch((reason:any) => {
      this.ll(1) && console.log(stime(this, ".send_join:"), "catch=", reason)
    })
    return promise
  }
  /**
   * client leaves the connection to server group.
   * 
   * The nice way to leave is send this to the Group/Ref, so they know you have gone.
   * Group/Ref forwards to [all] members. (and, apparently, back to the sender)
   * 
   * Or Ref/Server can send this to inform client/group that a client is being booted.
   * 
   * Recipient[s] simply Ack; if you are booted, you can close the group cnx, or try to rejoin.
   * 
   * @param group group_name
   * @param client_id the client_id that is leaving the Group
   * @param cause identifying string
   * @returns a Promise fulfilled(undefined) [there's no Ack]
   */
  send_leave(group: string, client_id?: number, cause?: string, nocc = false): AckPromise {
    let message = this.makeCgMessage({ type: CgType.leave, group, client_id, cause, nocc })
    return this.sendToSocket(message) // send_leave
  }

  /**
   * parse CgType: eval_ each of ack, nak, join, leave, send, none.
   * @param message 
   */
  override parseEval(message: CgMessage): void {
    // msgs_to_ack: join, leave, send, none?
    // QQQQ: allows to receive a new message while waiting for Ack. [which is good for echo test!]
    this.ll(1) && console.log(stime(this, `.parseEval[${this.client_port}] <- ${message.msgType}:`), this.msgToString(message))
    switch (message.type) {
      case CgType.ack: {
        if (this.ack_resolved) {
          let { msgType, success, cause} = message
          this.ll(1) && console.log(stime(this, `.parseEval[${this.client_port}] --`), "ignore spurious Ack:", { msgType, success, cause })
          this.ll(2) && console.log(stime(this, ".parseEval:"), 'p_ack=', this.promise_of_ack, 'p_msg=', this.msgToString(this.promise_of_ack.message))
          break
        } else if (message.success) {
          this.eval_ack(message, this.ack_message)
        } else {
          this.eval_nak(message, this.ack_message)
        }
        this.promise_of_ack.fulfill(message)
        break
      }
      case CgType.join: { this.eval_join(message); break }
      case CgType.leave: { this.eval_leave(message); break }
      case CgType.send: { this.eval_send(message); break }
      case CgType.none: { this.eval_none(message); break }
      default: {
        this.ll(1) && console.warn(stime(this, ".parseEval:"), `unknown CgType(${message.type}):`, this.msgToString(message))
      }
    }
    return
  }

  /**
   * Pro-forma: process positive Ack from join, leave, send.
   */
  eval_ack(message: CgMessage, req: CgMessage): void {
  }
  /**
   * Pro-forma: process Nak from send. (join & leave do not fail?)
   */
  eval_nak(message: CgMessage, req: CgMessage) {
  }
  /** informed that a Client wants to join Group; check client_id & passcode. */
  eval_join(message: CgMessage): void {
    this.ll(1) && console.log(stime(this, ".eval_join"), message)
    this.sendAck("CgBase default")
    return
  }

  /** CgBase informed (by CgServerDriver) that [other] Client has departed Group; OR I've been booted by Ref. */
  eval_leave(message: CgMessage): void {
    this.ll(1) && console.log(stime(this, `.eval_leave[${this.client_id}]:`), { msgObj: message.msgString })
    let client_id = message.client_id
    // pro'ly move this to CgClient: so can override log, and so CgServer can do its own.
    if (client_id === this.client_id) {
      // *I've* been booted from Group! (or I'm the ref[0] and everyone else has gone)
      let cause = `${client_id}-toldToLeave`
      this.send_leave(this.group_name, this.client_id, cause, true)
      this.leaveClose(cause)
    } else {
      // Normal client: "Ok, I see that ${client_id} has departed", nothing to do here.
      // nobody is listening for a 'leave' event...
      // TODO: create & dispatch an Event anyway?
    }
    return
  }
  /**
   * Action to take after my send_leave.
   * Base: closeStream(0, cause)
   * @param reason included with CLOSE_CODE(Normal) in closeStream()
   */
  leaveClose(reason: string) {
    this.ll(0) && console.log(stime(this, `.leaveClose[${this.client_id}]:`), `closeStream(${reason})`)
    this.closeStream(CLOSE_CODE.NormalClosure, reason) // presumably ref will have an onclose to kill itself
  }
  /**
   * Process message delivered to Client-Group.
   * 
   * For CgServerDriver: override to sendToGroup()
   * else Server would parseEval on behalf of the client...?
   * 
   * For CgClient: forward inner message to upstream protocol handler,
   * 
   * @param message with message.msg: DataBuf\<O>
   * @returns 
   */
  eval_send(message: CgMessage): void {
    if (this.upstream) {
      this.ll(1) && console.log(stime(this, ".eval_send:"), { wsmessage: json((this.upstream as BaseDriver<O, pbMessage>).deserialize(message.msg).toObject()) })
      this.upstream.wsmessage(message.msg, message) // -> upstream.wsmessage(msg)
    } else {
      this.ll(1) && console.log(stime(this, ".eval_send: sendNak(no upstream)"), this.msgToString(message))
      this.sendNak("no upstream", {client_id: message.client_from})
    }
    return
  }

  /** not used */
  eval_none(message: CgMessage) {
    this.ll(1) && console.log(stime(this, ".eval_none:"), message.toArray())
    this.sendAck("none done", {client_id: message.client_from})
    return
  }
}