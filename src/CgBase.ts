import { BaseDriver } from "./BaseDriver";
import { className, CLOSE_CODE, DataBuf, EzPromise, pbMessage, stime, WebSocketDriver } from "./types";
import { CgMessage, CgType } from "./CgProto";

// https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
declare module './CgProto' {
  interface CgMessage {
    expectsAck(): boolean 
    cgType: string
  }
}
/** [none, send, join, leave] expectsAck */
CgMessage.prototype.expectsAck = function() {
  return [CgType.none, CgType.send, CgType.join, CgType.leave].includes(this.type)
}
// Augment CgType with accessor that returns CgType as a string.
Object.defineProperty(CgMessage.prototype, 'cgType', {
  get: function () {
    return CgType[this.type]
  }
})

let x: string = new CgMessage().cgType
// export type ParserFactory<INNER extends pbMessage, OUTER extends CgMessage> 
//    = (cnx: CgBaseCnx<INNER, OUTER>) => PbParser<INNER>;

// https://www.typescriptlang.org/docs/handbook/utility-types.html
type CGMK = Exclude<keyof CgMessage, Partial<keyof pbMessage> | "serialize">
export type CgMessageOpts = Partial<Pick<CgMessage, CGMK>>

// use { signature } to define a type; a class type using { new(): Type }
//function create<Type>(c: { new (): Type }): Type { return new c(); }

/** 
 * EzPromise\<CgMessage\> which holds the actual message that was sent.  
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
 * BaseDriver\<I extends DataBuf\<CgMessage\>, O extends DataBuf\<pbMessage\>\>
 */
export class CgBase<O extends pbMessage> extends BaseDriver<CgMessage, O> 
  implements WebSocketDriver<CgMessage, pbMessage> {
  static msgsToAck = [CgType.send, CgType.join, CgType.leave]

  /** group from Ack of join() */
  group_name: string;  // group to which this connection is join'd
  /** client_id from Ack of join() */
  client_id: number;   // my client_id for this group.

  // this may be tricky... need to block non-ack from any client with outstanding ack
  // (send them an immediate nak) in CgServerDriver
  /** 
   * private, but .resolved and .message are accessible:  
   * message holds the last sent message that expects an Ack.  
   */
  private promise_of_ack: AckPromise = new AckPromise(new CgMessage({type: CgType.none})).fulfill(null);
  get ack_promise(): AckPromise { return this.promise_of_ack } // read-only for debugging CgServerDriver
  get ack_resolved(): boolean { return this.promise_of_ack.resolved }
  get ack_message(): CgMessage { return this.promise_of_ack.message }
  get ack_message_type(): string { return this.promise_of_ack.message.cgType }
  
  // see also: EzPromise.handle(fil, rej, catch, fin)
  waitForAckThen(fil: (ack: CgMessage) => void, rej?: (reason: any) => void): void {
    this.promise_of_ack.then(fil, rej)
  }
  deserialize(bytes: DataBuf<CgMessage>): CgMessage  {
    return CgMessage.deserialize(bytes)
  }
  /** 
   * dispatch, deserialize && parseEval(message) 
   * @override BaseDriver
   */
  wsmessage(data: DataBuf<CgMessage>, wrapper?: pbMessage) {
    this.dispatchMessageEvent(data)
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
    console.log(stime(this, ".onClose:"), ev.code, ev.reason)
    this.promise_of_ack.reject(ev.reason)
    super.onclose(ev) // send to upstream.onclose(ev)
  }
  // opts?: Exclude<CgMessageOpts, "cause" | "type">
  /**
   * this.sendToSocket(new Ack(success: true), ...opts)
   * @param cause string
   * @param opts optional CgMessageOpts
   * @return AckPromise (ackPromise.value is undefined)
   */
  sendAck(cause: string, opts?: CgMessageOpts): AckPromise {
    return this.sendToSocket(new CgMessage({ success: true, ...opts, cause, type: CgType.ack }))
  }
  /**
   * this.sendToSocket(new Ack(success: false), ...opts)
   * @param cause 
   * @param opts 
   * @returns 
   */
  sendNak(cause: string, opts?: CgMessageOpts) {
    return this.sendToSocket(new CgMessage({ success: false, ...opts, cause, type: CgType.ack }))
  }

  /** debugging utility */
  innerMessageString(m: CgMessage) {
    //if (!m) return undefined
    return m && ((m.msg !== undefined) ? `send[${m.msg[1]}+${m.msg.length}]` : `${m.cgType}(${m.cause || m.success})`)
  }

  /** 
   * Send message downstream, toward websocket. 
   * 
   * @return an AckPromise: &nbsp; &nbsp;
   * .reject(error) if there is an error while sending &nbsp; &nbsp;
   * .fulfill(ackMsg) when Ack for CgType: join, leave, send is received &nbsp; &nbsp;
   * .fulfill(undefined) if sending an Ack or None...
   */
  sendToSocket(message: CgMessage): AckPromise {
    let ackPromise = new AckPromise(message)
    let bytes = message.serializeBinary()
    // TODO: reimplement so this does something useful
    let reject_on_error = (error: Error | Event) => {
      ackPromise.reject((error as Error).message || (error as Event).type)
    }
    this.sendBuffer(bytes) // send message to socket
    if (!message.expectsAck()) {
      ackPromise.fulfill(undefined) // no Ack is coming
    } else {
      console.log(stime(this, `.sendToSocket[${this.client_id}] p_ack=`), this.innerMessageString(ackPromise.message))
      this.promise_of_ack = ackPromise // Ack for the most recent message.expectsAck
    }
    // console.log(stime(this, ".sendToSocket:"), message.cgType, {message, ackPromise})
    return ackPromise
  }
  /**
   * send a useless "none" message.
   * @param group 
   * @param client_id destination target client or undefined for the whole Group
   * @param cause 
   * @returns AckPromise
   */
  send_none(group?: string, client_id?: number, cause?: string): AckPromise {
    let message = new CgMessage({ type: CgType.none, group: group, client_id, cause })
    let promise = this.sendToSocket(message)
    return promise
  }

  /**
   * send message from upstream to downstream
   * @param message Object containing pbMessage<INNER>
   * @param opts  
   * client_id: 0 is ref, [null is to Group]  
   * nocc: true to prevent copy back, [false is cc to sender]  
   */
  send_send(message: O, opts?: CgMessageOpts): AckPromise {
    let msg = message.serializeBinary()
    let cgmsg: CgMessage = new CgMessage({...opts, type: CgType.send, msg })
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
    let message = new CgMessage({ type: CgType.join, group, client_id, cause })
    let promise = this.sendToSocket(message)
    //console.log(stime(this, ".send_join:"), "promise=", promise, "then=", promise.then)
    promise.then((ack) => {
      //console.log(stime(this, ".send_join"), "ack=", ack)
      this.group_name = ack.group
      this.client_id = ack.client_id
    }, (rej: any) => {
      console.log(stime(this, ".send_join:"), "rej=", rej)
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
    let message = new CgMessage({ type: CgType.leave, group, client_id, cause })
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
    return (message.client_id === 0)
  }

  /**
   * parse CgType: eval_ each of ack, nak, join, leave, send, none.
   * @param message 
   */
  parseEval(message: CgMessage, wrapper?: pbMessage, ...args: any): void {
    // msgs_to_ack: join, leave, send, none?
    // QQQQ: allows to receive a new message while waiting for Ack. [which is good for echo test!]
    //console.log(stime(this, ".parseEval:"), "Received:", message.cgType, message)
    switch (message.type) {
      case CgType.ack: {
        if (this.ack_resolved) {
          let { cgType, success, cause, client_id} = message
          console.log(stime(this, ".parseEval:"), this.client_id, "ignore spurious Ack:", {cgType, success, cause, client_id})
          // console.log(stime(this, ".parseEval:"), 'p_ack=', this.promise_of_ack, 'p_msg=', this.innerMessageString(this.promise_of_ack.message))
        } else if (message.success) {
          this.eval_ack(message, this.ack_message)
        } else {
          this.eval_nak(message, this.ack_message)
        }
        break
      }
      case CgType.join: {
        this.eval_join(message)
        break
      }
      case CgType.leave: {
        this.eval_leave(message)
        break
      }
      case CgType.send: {
        this.eval_send(message)
        break
      }
      case CgType.none: {
        this.eval_none(message)
      }
      default: {
        console.log(stime(this, ".parseEval:"), "message has no CgType: ", message)
      }
    }
  }
  /**
   * Action to take after leaving group.
   * Base: closeStream(0, cause)
   * @param cause 
   */
  on_leave(cause: string) {
    console.log(stime(this, ".on_leave:"), "closeStream:", cause)
    this.closeStream(CLOSE_CODE.NormalCLosure, cause) // presumably ref will have an onclose to kill itself
  }
  /**
   * process positive Ack from join, leave, send.
   * Resolve the outstanding send Promise<CgMessage> 
   */
  eval_ack(message: CgMessage, req: CgMessage): void {
    this.promise_of_ack.fulfill(message); // maybe verify ack# ?
  }
  /**
   * process Nak from send. (join & leave do not fail?)
   * if override to process join/leave: include super.eval_nak() 
   */
  eval_nak(message: CgMessage, req: CgMessage) {
    this.promise_of_ack.fulfill(message); // maybe verify ack#
  }
  /** informed that a client wants to join; check client_id & passcode. */
  eval_join(message: CgMessage): void {
    console.log(stime(this, ".eval_join"), message)
    this.sendAck("CgBase default")
    return
  }

  /** informed that [other] client has departed */
  eval_leave(message: CgMessage): void {
    console.log(stime(this, ".eval_leave:"), message)
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
   * else server would parseEval on behalf of the client...?
   * 
   * For CgClient: delegate to upstream protocol handler
   * 
   * 
   * @param message containing message<IN>
   * @returns 
   */
  eval_send(message: CgMessage): void {
    if (this.upstream) {
      console.log(stime(this, ".eval_send:"), (this.upstream as CgBase<O>).deserialize(message.msg))
      this.upstream.wsmessage(message.msg, message)
    } else {
      console.log(stime(this, ".eval_send:"), "no upstream:", message)
      this.sendNak("no send upstream", {client_id: message.client_from})
    }
    return
  }

  /** not used */
  eval_none(message: CgMessage) {
    console.log(stime(this, ".eval_none:"), message)
    this.sendAck("none done", {client_id: message.client_from})
    return
  }
}