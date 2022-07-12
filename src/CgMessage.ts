import { json } from '@thegraid/common-lib'
import { CgMsgBase } from './proto/CgProto.js'
import { charString, pbMessage } from './types.js'
import { CgType } from './proto/CgProto.js'
import type { BinaryReader } from 'google-protobuf';

export { CgType };
//function charString(char) { return (char >= 32 && char < 127) ? String.fromCharCode(char) : `\\${char.toString(10)}`}

// add methods to the objects created by new CgMessage()
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
  get msgObject(): CgMessageOptsX {
    let msgType = this.msgType  // every CgMessage has a msgType
    let msgObj: CgMessageOptsW = { msgType } // { msgType, ...this.toObject() }
    if (this.type == CgType.ack) msgObj.success = this.success
    if (this.client_id !== undefined) msgObj.client_id = this.client_id
    if (this.client_from !== undefined) msgObj.client_from = this.client_from
    if (this.cause?.length > 0) msgObj.cause = this.cause 
    if (this.info?.length > 0) msgObj.info = this.info
    if (this.ident != 0) msgObj.ident = this.ident
    if (this.group?.length > 0) msgObj.group = this.group
    if (this.nocc != false) msgObj.nocc = this.nocc
    if (this.msg?.length > 0) msgObj.msgStr = this.msgStr
    if (this.acks?.length > 0) msgObj.acks = this.acks
    return msgObj
  }
  get msgString() { return json(this.msgObject) }

  /** delegate to CgBaseMsg */
  static override deserialize(data: Uint8Array | BinaryReader) {
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
type CGMK = Exclude<keyof CgMessage, Partial<keyof pbMessage> | CGMKw | CGMKx >
/** shape of msgObject */
type CgMessageOptsX = Partial<Pick<CgMessage, CGMK | CGMKx>>
/** writeable msgObject: used internally to create msgObject */
type CgMessageOptsW = { -readonly [key in keyof CgMessageOptsX] : CgMessageOptsX[key] }
/** Attributes that can be set when making/sending a CgMessage. */
export type CgMessageOpts = Partial<Pick<CgMessage, CGMK>>
