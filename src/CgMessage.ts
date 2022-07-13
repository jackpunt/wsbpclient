import { json } from '@thegraid/common-lib';
import * as jspb from 'google-protobuf'; // pb_1
import { CgMsgBase, CgType } from './proto/CgProto.js';
import { charString, pbMessage } from './types.js';

export { CgType };

/** add methods to extend CgMsgBase */
export class CgMessage extends CgMsgBase {
  /** (message.client_id === GROUP_ID) tell CgServer to cast to all group members (+/- nocc) */
  static GROUP_ID = 255 
  declare toObject: () => ReturnType<CgMsgBase['toObject']>

  get msgPeek() {
    let msg = this.msg
    return (msg !== undefined) ? `${this.msgType}[${msg[1]}+${msg.length}]` : undefined //`${this.cgType}(${this.cause || this.success})`)
  }
  get msgType() {
    let type = this.type
    return (type !== CgType.ack) ? CgType[type] : this.success ? 'Ack' : 'Nak'
  }
  get expectsAck() {
    return [CgType.none, CgType.send, CgType.join].includes(this.type)
  }
  /** this.msg ? this.msgPeek+strings : undefined; this.msg defined for Ack/Nak & Send */
  get msgStr() {
    let msg = (this as CgMessage).msg
    if (msg?.length > 0) {
      let bytes = msg.slice(1), strs = [] // unshift the first byte... [the 'type' byte?]?
      bytes.forEach(char => strs.push(charString(char)))
      return `${this.msgPeek}${":".concat(...strs)}]`
    }
    return undefined
  }
  get has_type() { return jspb.Message.getField(this, 1)}
  get has_client_id() { return jspb.Message.getField(this, 2)}
  get has_success() { return jspb.Message.getField(this, 3)} // note: only applies to Ack
  get has_client_from() { return jspb.Message.getField(this, 4)}
  get has_cause() { return jspb.Message.getField(this, 5)}
  get has_info() { return jspb.Message.getField(this, 6)}
  get has_ident() { return jspb.Message.getField(this, 7)}
  get has_msg() { return jspb.Message.getField(this, 8)}
  get has_group() { return jspb.Message.getField(this, 9)}
  get has_nocc() { return jspb.Message.getField(this, 10)}
  get has_acks() { return this.acks?.length > 0 } // 11

  get msgObject(): CgMessageOptsX {
    // every CgMessage has a msgType; put it first in the result object:
    let msgObj: CgMessageOptsW = { msgType: this.msgType } // { msgType, ...this.toObject() }
    if (this.has_success) msgObj.success = this.success
    if (this.has_client_id) msgObj.client_id = this.client_id
    if (this.has_client_from) msgObj.client_from = this.client_from
    if (this.has_cause) msgObj.cause = this.cause 
    if (this.has_info) msgObj.info = this.info
    if (this.has_ident) msgObj.ident = this.ident
    if (this.has_group) msgObj.group = this.group
    if (this.has_nocc) msgObj.nocc = this.nocc
    if (this.has_msg) msgObj.msgStr = this.msgStr
    if (this.acks?.length > 0) msgObj.acks = this.acks
    return msgObj
  }

  get msgString() { return json(this.msgObject) }

  /** delegate to CgBaseMsg; but inject CgMessage methods. */
  static override deserialize(data: Uint8Array) {
    if (data == undefined) return undefined as CgMessage
    let newMsg = CgMsgBase.deserialize(data) as CgMessage
    if (newMsg instanceof CgMsgBase) {
      Object.setPrototypeOf(newMsg, CgMessage.prototype)
    }
    return newMsg
  }
}

// https://www.typescriptlang.org/docs/handbook/utility-types.html
type CGMKw = "serialize" | "expectsAck" // hidden
/** visible as CgMessageOptX -- in the output msgObject */
type CGMKx = "msgType" | "msgObject" | "msgString" | "msgPeek" | "msgStr"
/** Keys for CgMessage constructor. */
type CGMK = Exclude<keyof CgMsgBase, Partial<keyof pbMessage> | CGMKw>
/** shape of msgObject */
type CgMessageOptsX = Partial<Pick<CgMessage, CGMK | CGMKx>>
/** writeable msgObject: used internally to create msgObject */
type CgMessageOptsW = { -readonly [key in keyof CgMessageOptsX] : CgMessageOptsX[key] }
/** Attributes that can be set when making/sending a CgMessage. */
export type CgMessageOpts = Partial<Pick<CgMessage, CGMK>>
