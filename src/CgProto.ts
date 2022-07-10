import { json } from '@thegraid/common-lib'
import { CgMessage as CgMsgBase } from './proto/CgProto.js'
import { charString, pbMessage } from './types.js'
import { CgType } from './proto/CgProto.js'
import type { BinaryReader } from 'google-protobuf';

export { CgType };
//function charString(char) { return (char >= 32 && char < 127) ? String.fromCharCode(char) : `\\${char.toString(10)}`}

// add methods to the objects created by new CgMessage()
export class CgMessage extends CgMsgBase {
  /** (message.client_id === GROUP_ID) tell CgServer to cast to all group members (+/- nocc) */
  static GROUP_ID = 255 
  get msgPeek() {
    let thss = (this as CgMessage), msg = thss.msg
    return (msg !== undefined) ? `${thss.msgType}[${msg[1]}+${msg.length}]` : undefined //`${this.cgType}(${this.cause || this.success})`)
  }
  get msgType() {
    let thss = (this as CgMessage), type = thss.type
    return (type !== CgType.ack) ? CgType[type] : thss.success ? 'Ack' : 'Nak'
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
    let thss: CgMessage = this
    let msgType = thss.msgType  // every CgMessage has a msgType
    let msgObj: CgMessageOptsW = { msgType } // { msgType, ...this.toObject() }
    if (thss.type == CgType.ack) msgObj.success = thss.success
    if (thss.client_id !== undefined) msgObj.client_id = thss.client_id
    if (thss.client_from !== undefined) msgObj.client_from = thss.client_from
    if (thss.cause?.length > 0) msgObj.cause = thss.cause 
    if (thss.info?.length > 0) msgObj.info = thss.info
    if (thss.ident != 0) msgObj.ident = thss.ident
    if (thss.group?.length > 0) msgObj.group = thss.group
    if (thss.nocc != false) msgObj.nocc = thss.nocc
    if (thss.msg?.length > 0) msgObj.msgStr = thss.msgStr
    if (thss.acks?.length > 0) msgObj.acks = thss.acks
    return msgObj
  }
  get msgString() { return json(this.msgObject) }

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
type CGMKw = "serialize" | "outObject" | "expectsAck" // hidden
type CGMKx = "msgType" | "msgPeek" | "msgStr"         // visible as CgMessageOptX [? | "msgObject"]
type CGMK = Exclude<keyof CgMessage, Partial<keyof pbMessage> | CGMKw | CGMKx >
/** shape of msgObj */
type CgMessageOptsX = Partial<Pick<CgMessage, CGMK | CGMKx>>
/** writeable msgObj */
type CgMessageOptsW = { -readonly [key in keyof CgMessageOptsX] : CgMessageOptsX[key] }
/** Attributes that can be set when making/sending a CgMessage. */
export type CgMessageOpts = Partial<Pick<CgMessage, CGMK>>
