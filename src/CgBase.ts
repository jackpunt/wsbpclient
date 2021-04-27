import { BaseDriver } from "./BaseDriver";
import { AWebSocket, DataBuf, EzPromise, pbMessage, stime, WebSocketDriver } from "./types";
import { CgMessage, CgType } from "./CgProto";

// https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation
declare module './CgProto' {
  interface CgMessage {
    expectsAck(): boolean 
  }
}
CgMessage.prototype.expectsAck = function() {
  return [CgType.send, CgType.join, CgType.leave].includes(this.type)
}

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
  constructor(public message: CgMessage, def = (ful, rej) => { }) {
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
  // (send them an immediate nak)
  /** private, but message.type is accessible */
  private promise_of_ack: AckPromise; // also holds the message that was sent
  get has_message_to_ack(): boolean { return !!this.promise_of_ack && !!this.promise_of_ack.message }
  get message_to_ack_type(): CgType { return this.has_message_to_ack && this.promise_of_ack.message.type }

  deserialize(bytes: DataBuf<CgMessage>): CgMessage  {
    return CgMessage.deserialize(bytes)
  }
  /** deserialize && parseEval(message) 
   * @override
   */
  wsmessage(data: DataBuf<CgMessage>) {
    let message = CgMessage.deserialize(data)
    this.parseEval(message)    
  }

  /**
   * @param ev
   * @override
   */
  onerror(ev: Event) {
    super.onerror(ev)    // maybe invoke sentError(ev)
    if (this.promise_of_ack) {
      this.promise_of_ack.reject(ev)
    }
  }
  /**
   * 
   * @param ev 
   * @override
   */
  onclose(ev: Event) {
    if (this.promise_of_ack) {
      this.promise_of_ack.reject(ev)
    }
  }
  // opts?: Exclude<CgMessageOpts, "cause" | "type">
  /**
   * 
   * @param cause 
   * @param opts 
   */
  sendAck(cause: string, opts?: CgMessageOpts): AckPromise | undefined {
    return this.sendToSocket(new CgMessage({ success: true, ...opts, cause, type: CgType.ack }))
  }
  sendNak(cause: string, opts?: CgMessageOpts) {
    return this.sendToSocket(new CgMessage({ success: false, ...opts, cause, type: CgType.ack }))
  }


  /** 
   * Send message downstream, toward websocket. 
   * 
   * @return an AckPromise that:
   * 
   * rejects if there is an error while sending
   * 
   * resolves when Ack for CgType: join, leave, send is received
   * 
   * resolves immediately if sending an Ack or None...
   */
  sendToSocket(message: CgMessage): AckPromise {
    let ackPromise = new AckPromise(message)
    let bytes = message.serializeBinary()
    // TODO: reimplement so this does something useful
    let reject_on_error = (error: Error | Event) => {
      ackPromise.reject((error as Error).message || (error as Event).type)
    }
    this.sendBuffer(bytes) // send message to socket
    if (!message.expectsAck() && !ackPromise.resolved) {
      ackPromise.fulfill(undefined) // no Ack is coming
    } else {
      this.promise_of_ack = ackPromise // Ack for the most recent message.expectsAck
    }
    return ackPromise
  }
  /** 
   * send a [sub-protocol (O = CmMessage)] message, wrapped in a I = CgMessage(CgType.send)
   * @return AckPromise that resolves to the Ack/Nak of the send message
   */
  sendWrapped(message: O, client_id?: number): AckPromise {
    let msg = message.serializeBinary()
    let cgmsg: CgMessage = new CgMessage({ type: CgType.send, msg, client_id });
    return this.sendToSocket(cgmsg)
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
    let promise =  this.sendToSocket(cgmsg)
    return promise
  }
  /**
   * send_join client makes a connection to server group
   * @param group group name
   * @param id client_id
   * @param cause identifying string
   * @returns a Promise that completes when an Ack/Nak is recieved
   */
  send_join(group: string, id?: number, cause?: string): AckPromise {
    let message = new CgMessage({ type: CgType.join, group: group, client_id: id, cause: cause })
    let promise = this.sendToSocket(message)
    //console.log(stime(), "send_join: promise=", promise, "then=", promise.then)
    promise.then((ack) => {
      this.group_name = ack.group
      this.client_id = ack.client_id
    }, (rej: any) => {
      console.log("CgBase.send_join:", rej)
    })
    return promise
  }
  /**
   * client makes a connection to server group.
   * 
   * @param group group_name
   * @param id the client_id
   * @param cause identifying string
   * @returns a Promise that completes when an Ack/Nak is recieved
   */
  send_leave(group: string, id?: number, cause?: string): Promise<CgMessage> {
    let message = new CgMessage({ type: CgType.leave, group: group, client_id: id })
    let promise = this.sendToSocket(message)
    promise.then((ack) => {this.on_leave(ack.cause)}, (nak) => {})
    return promise
  }

  /** 
   * Nak from referee indicates that message was semantically illegal.
   * Referee never[?] initiates a request message; can Nak a request; 
   * (not clear if CgClient needs this...)
   */
  isFromReferee(message: CgMessage): boolean {
    return (message.client_id === 0 && message.cause === "referee")
  }

  /**
   * parse CgType: eval_ each of ack, nak, join, leave, send, none.
   * @param message 
   */
  parseEval(message: CgMessage): void {
    // msgs_to_ack: join, leave, send, none?
    // QQQQ: allows to receive a new message while waiting for Ack. [which is good for echo test!]
    switch (message.type) {
      case CgType.ack: {
        let req = !!this.promise_of_ack && this.promise_of_ack.message;
        if (!(req instanceof CgMessage)) {
          console.log(stime(), "CgBase: ignore spurious Ack:", message)
        } else if (message.success) {
          this.eval_ack(message, req)
        } else {
          this.eval_nak(message, req)
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
        console.log(stime(), "CgBase: message has no CgType: ", message)
      }
    }
  }
  /**
   * Action to take after leaving group.
   * Base: close socket
   * @param cause 
   */
  on_leave(cause: string) {
    this.closeStream(0, cause) // presumably ref will have an onclose to kill itself
  }
  /**
   * process positive Ack from join, leave, send.
   * Resolve the outstanding send Promise<CgMessage> 
   */
  eval_ack(message: CgMessage, req: CgMessage): void {
    if (!!this.promise_of_ack) {
      this.promise_of_ack.fulfill(message);
      this.promise_of_ack = undefined  // invalidate this.promise_of_ack
    }
    return
  }
  /**
   * process Nak from send. (join & leave do not fail?)
   * if override to process join/leave: include super.eval_nak() 
   */
  eval_nak(message: CgMessage, req: CgMessage) {
    if (!!this.promise_of_ack) {
      this.promise_of_ack.fulfill(message);
      this.promise_of_ack = undefined  // invalidate this.promise_of_ack
    }
    return
  }
  /** informed that a client wants to join; check client_id & passcode. */
  eval_join(message: CgMessage): void {
    console.log(stime(), "CgBase.join: ", message)
    return
  }

  /** informed that [other] client has departed */
  eval_leave(message: CgMessage): void {
    console.log(stime(), "CgBase.leave:", message)
    // pro'ly move this to CgClient: so can override log, and so CgServer can do its own.
    if (message.client_id === this.client_id) {
      // booted from group! (or i'm the ref[0] and everyone else has gone)
      this.sendAck("leaving", { group: this.group_name })
      this.on_leave("asked to leave")
    }
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
    if (this.upstream)
      this.upstream.wsmessage(message.msg)
    else
      console.log(stime(), "CgBase.send:", message)
    return
  }

  /** not used */
  eval_none(message: CgMessage) {
    console.log(stime(), "CgBase.none:", message)
    return
  }
}