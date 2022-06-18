import { BaseDriver } from "./BaseDriver.js";
import { className, CLOSE_CODE, DataBuf, EzPromise, pbMessage, stime, WebSocketDriver } from "./types.js";
import { CgMessage, CgType } from "./CgProto.js";

// https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
declare module './CgProto' {
  interface CgMessage {
    /** @return true for: none, send, join, leave */
    expectsAck(): boolean
    /** extract and stringify fields of CgMessage | CgMessageOpts */
    outObject(): CgMessageOpts
    msgStr: string
    /** 
     * Peek at inner msg without deserializing it.  
     * this.msg defined for send OR ack(send)  
     * send[type+length] OR Ack[2+length]  
     */
    msgPeek: string
    /** @return CgType as a string: CgType[type] */
    cgType: string
  }
}
/** [none, send, join, leave] expectsAck */
CgMessage.prototype.expectsAck = function(): boolean {
  return [CgType.none, CgType.send, CgType.join, CgType.leave].includes(this.type)
}
//    

/** a readable view into a CgMessage */
CgMessage.prototype.outObject = function(): CgMessageOpts {
  let thss: CgMessage = this
  let { cgType } = thss
  let msgObj: CgMessageOpts = { cgType }
  if (thss.client_id !== undefined) msgObj.client_id = thss.client_id
  if (thss.success !== undefined) msgObj.success = thss.success
  if (thss.client_from !== undefined) msgObj.client_from = thss.client_from
  if (thss.cause !== undefined) msgObj.cause = thss.cause 
  if (thss.info !== undefined) msgObj.info = thss.info
  if (thss.ident !== undefined) msgObj.ident = thss.ident
  if (thss.group !== undefined) msgObj.group = thss.group
  if (thss.nocc !== undefined) msgObj.nocc = thss.nocc
  if (thss.msg !== undefined) msgObj.msgStr = thss.msgStr
  return msgObj
}
// Augment CgType with accessor that returns CgType as a string.
Object.defineProperty(CgMessage.prototype, 'cgType', {
  get: function () {
    let type = this.type
    return (type !== CgType.ack) ? CgType[this.type] : this.success? 'Ack' : 'Nak'
  }
})
Object.defineProperty(CgMessage.prototype, 'msgPeek', {
  get: function() {
    return (this.msg !== undefined) ? `${this.cgType}[${this.msg[1]}+${this.msg.length}]` : undefined //`${this.cgType}(${this.cause || this.success})`)
  }
})
Object.defineProperty(CgMessage.prototype, 'msgStr', {
  get: function() {
    let thss: CgMessage = this
    if (thss.msg === undefined) return undefined
    let strFromChar = (char: number) => (char >= 32) ? String.fromCharCode(char) : `\\${char}` ;
    let chars = [], bytes = (thss.msg as Uint8Array);
    for( let i = 2; i<thss.msg.length; i++) chars.push(strFromChar(bytes[i])) 
    return `${thss.cgType}[${thss.msg[1]}+${thss.msg.length}${":".concat(...chars)}]`
  }
})

// export type ParserFactory<INNER extends pbMessage, OUTER extends CgMessage> 
//    = (cnx: CgBaseCnx<INNER, OUTER>) => PbParser<INNER>;

// https://www.typescriptlang.org/docs/handbook/utility-types.html
type CGMK = Exclude<keyof CgMessage, Partial<keyof pbMessage> | "serialize">
export type CgMessageOpts = Partial<Pick<CgMessage, CGMK>>

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
 * BaseDriver\<I extends DataBuf\<CgMessage>, O extends DataBuf\<pbMessage>>
 */
export class CgBase<O extends pbMessage> extends BaseDriver<CgMessage, O> 
  implements WebSocketDriver<CgMessage, pbMessage> {
  static msgsToAck = [CgType.send, CgType.join, CgType.leave]
  
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
  get client_port(): string | number { return this.client_id; }

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
  get ack_message_type(): string { return this.promise_of_ack.message.cgType }
  
  deserialize(bytes: DataBuf<CgMessage>): CgMessage  {
    return CgMessage.deserialize(bytes)
  }
  /** 
   * dispatch, deserialize && parseEval(message) 
   * @param data DataBuf containing \<CgMessage>
   * @param wrapper [unlikely...]
   * @override BaseDriver
   */
  override wsmessage(data: DataBuf<CgMessage>, wrapper?: pbMessage) {
    super.wsmessage(data)
    let message = CgMessage.deserialize(data)
    this.parseEval(message, wrapper)
  }

  /**
   * @param ev
   * @override
   */
  onerror(ev: Event) {
    super.onerror(ev)    // maybe invoke sentError(ev)
    this.promise_of_ack.reject(ev)  // if not already resolved...
  }
  /**
   * 
   * @param ev 
   * @override
   */
  onclose(ev: CloseEvent) {
    this.log && console.log(stime(this, ".onClose:"), {code: ev.code, reason: ev.reason})
    this.promise_of_ack.reject(ev.reason)
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
    let ackOpts = this.ackOpts(opts)
    return this.sendToSocket(this.makeCgMessage({ success: true, ...ackOpts, cause, type: CgType.ack }))
  }
  /**
   * this.sendToSocket(new Ack(success: false), ...opts)
   * @param cause 
   * @param opts CgMessageOpts | CgMessage
   * @returns 
   */
  sendNak(cause: string, opts?: CgMessageOpts) {
    let ackOpts = this.ackOpts(opts)
    return this.sendToSocket(this.makeCgMessage({ success: false, ...ackOpts, cause, type: CgType.ack }))
  }

  /** debugging utility */
  innerMessageString(m: CgMessage): string {
    // assert: msg defined ONLY for m.cgType=='send' && 'ack'; m.msg[1] is the INNER type
    return m && (m.msgStr || `${m.cgType}(${m.cause || m.success})`)
  }

  /** 
   * If message.expectsAck [Wait for this.ack_promise, then]
   * sendBufer(message) downstream, toward websocket. 
   * 
   * @param message to be serialized and sent dnstream
   * @param ackPromise do NOT provide; new AckPromise(message)
   * @final do NOT override
   * @return AckPromise(message):  
   * .reject(error) if there is an error while sending  
   * .fulfill(ackMsg) when Ack for CgType: join, leave, send is received  
   * .fulfill(undefined) if sending an Ack
   */
  sendToSocket(message: CgMessage, ackPromise: AckPromise = new AckPromise(message)): AckPromise {
    if ((message.expectsAck() && !this.ack_resolved)) {
      // queue this message for sending when current message is ack'd:
      this.log && console.log(stime(this, `.sendToSocket[${this.client_id}] defer=`), { msgStr: this.innerMessageString(message), resolved: this.ack_resolved })
      this.ack_promise.then((ack) => {
        this.log && console.log(stime(this, `.sendToSocket[${this.client_id}] refer=`), { msgStr: this.innerMessageString(ack) })
        this.sendToSocket(message, ackPromise) //.then((ack) => ackPromise.fulfill(ack))
      })
      return ackPromise  // with message un-sent
    }
    // TODO: reimplement so this does something useful: this.dnstream.onerror => () => reject_on_error() ??
    const reject_on_error = (error: Error | Event) => {
      ackPromise.reject((error as Error).message || (error as Event).type)
    }

    const bytes = message.serializeBinary()
    this.sendBuffer(bytes) // send message to socket

    if (message.expectsAck()) {
      this.log && console.log(stime(this, `.sendToSocket[${this.client_id}] p_ack=`), this.innerMessageString(ackPromise.message))
      this.promise_of_ack = ackPromise // Ack for the most recent message.expectsAck()
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
    let promise = this.sendToSocket(message)
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
    let promise = this.sendToSocket(cgmsg)
    return promise
  }
  /**
   * send_join client makes a connection to server group
   * @param group group name
   * @param client_id specify 0 to register as referee; else undefined
   * @param cause specify 'referee' to register as referee; else undefined
   * @returns a Promise that completes when an Ack/Nak is recieved
   */
  send_join(group: string, client_id?: number, cause?: string): AckPromise {
    let message = this.makeCgMessage({ type: CgType.join, group, client_id, cause })
    let promise = this.sendToSocket(message)
    //console.log(stime(this, ".send_join:"), "promise=", promise, "then=", promise.then)
    promise.then((ack) => {
      //console.log(stime(this, ".send_join"), "ack=", ack)
      this.group_name = ack.group
      this.client_id = ack.client_id
    }, (rej: any) => {
      this.log && console.log(stime(this, ".send_join:"), "rej=", rej)
    })
    promise.catch((reason:any) => {
      this.log && console.log(stime(this, ".send_join:"), "catch=", reason)
    })
    return promise
  }
  /**
   * client leaves the connection to server group.
   * 
   * @param group group_name
   * @param client_id the client_id that is leaving the Group
   * @param cause identifying string
   * @returns a Promise that completes when an Ack/Nak is recieved
   */
  send_leave(group: string, client_id?: number, cause?: string): AckPromise {
    let message = this.makeCgMessage({ type: CgType.leave, group, client_id, cause })
    let promise = this.sendToSocket(message)
    promise.then((ack) => { this.on_leave(ack.cause) }, (nak) => {})
    return promise
  }

  /** 
   * Nak from referee indicates that message was semantically illegal.
   * Referee never[?] initiates a request message; can Nak a request; 
   * (not clear if CgClient needs this...)
   */
  isFromReferee(message: CgMessage): boolean {
    return (message.client_from === 0)
  }

  /**
   * parse CgType: eval_ each of ack, nak, join, leave, send, none.
   * @param message 
   */
  parseEval(message: CgMessage, wrapper?: pbMessage, ...args: any): void {
    // msgs_to_ack: join, leave, send, none?
    // QQQQ: allows to receive a new message while waiting for Ack. [which is good for echo test!]
    this.log && console.log(stime(this, `.parseEval[${this.client_port}] <- ${message.cgType}:`), this.innerMessageString(message))
    switch (message.type) {
      case CgType.ack: {
        if (this.ack_resolved) {
          let { cgType, success, cause, client_id} = message
          this.log && console.log(stime(this, `.parseEval[${this.client_port}] --`), "ignore spurious Ack:", {cgType, success, cause})
          // console.log(stime(this, ".parseEval:"), 'p_ack=', this.promise_of_ack, 'p_msg=', this.innerMessageString(this.promise_of_ack.message))
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
        this.log && console.log(stime(this, ".parseEval:"), "message has no CgType: ", message)
      }
    }
    return
  }
  /**
   * Action to take after leaving group.
   * Base: closeStream(0, cause)
   * @param cause 
   */
  on_leave(cause: string) {
    this.log && console.log(stime(this, ".on_leave:"), "closeStream:", cause)
    this.closeStream(CLOSE_CODE.NormalCLosure, cause) // presumably ref will have an onclose to kill itself
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
  /** informed that a client wants to join; check client_id & passcode. */
  eval_join(message: CgMessage): void {
    this.log && console.log(stime(this, ".eval_join"), message)
    this.sendAck("CgBase default")
    return
  }

  /** informed that [other] client has departed */
  eval_leave(message: CgMessage): void {
    this.log && console.log(stime(this, ".eval_leave:"), this.innerMessageString(message), message.outObject())
    // pro'ly move this to CgClient: so can override log, and so CgServer can do its own.
    if (message.client_id === this.client_id) {
      // booted from group! (or i'm the ref[0] and everyone else has gone)
      this.sendAck("leaving", { group: this.group_name })
      this.on_leave("asked to leave")
      return
    }
    this.sendAck(className(this)+".eval_leave")  // some other client has left the group...
    return
  }

  /**
   * Process message delivered to Client-Group.
   * 
   * For CgServerCnx: override to sendToGroup()
   * else Server would parseEval on behalf of the client...?
   * 
   * For CgClient: delegate to upstream protocol handler,
   * passing along the CgMessage wrapper.
   * 
   * @param message containing message\<IN extends pbMessage>
   * @returns 
   */
  eval_send(message: CgMessage): void {
    if (this.upstream) {
      this.log && console.log(stime(this, ".eval_send:"), (this.upstream as CgBase<O>).deserialize(message.msg))
      this.upstream.wsmessage(message.msg, message)
    } else {
      this.log && console.log(stime(this, ".eval_send:"), "no upstream:", message)
      this.sendNak("no send upstream", {client_id: message.client_from})
    }
    return
  }

  /** not used */
  eval_none(message: CgMessage) {
    this.log && console.log(stime(this, ".eval_none:"), message.toArray())
    this.sendAck("none done", {client_id: message.client_from})
    return
  }
}