import { json } from '@thegraid/common-lib'
import { MsgTypeMixin } from './MsgType.js'
import { GgMsgBase, GgType } from './proto/GgProto.js'
import type { pbMessage } from './types.js'
export { GgType, Rost } from './proto/GgProto.js'

/** GgMessage.Rost as interface: */
export type rost = { name: string, client: number, player: number }

type GGMK = Exclude<keyof GgMsgBase, Partial<keyof pbMessage> | "serialize">
/** keys to supply to new GgMessage() --> new GgMsgBase() */
export type GgMessageOpts = Partial<Pick<GgMsgBase, GGMK>>

/** typeof GgMesssge.toObject() */
export type GgMessageOptsX = ReturnType<GgMsgBase["toObject"]> & { msgType: string }
/** typeof GgMessage.msgObject */
export type GgMessageOptsW = { -readonly [key in keyof GgMessageOptsX] : GgMessageOptsX[key] }

type MsgKeys = Exclude<keyof GgMsgBase, Partial<keyof pbMessage> | "serialize">
type ConsType = { -readonly [key in keyof Partial<Pick<GgMsgBase, MsgKeys>>] : GgMsgBase[key] }
type ObjType = ReturnType<GgMsgBase['toObject']>

// https://github.com/microsoft/TypeScript/issues/41347
// TS-4.6.2 does not allow Mixins to have override-able get accessors [d.ts cannot tell property from accessor]
// so we will forego 'extends MsgTypeMixin(GgMsgBase)' until that is fixed (fixed May 2022...)
export class GgMessage extends (GgMsgBase) {
  constructor(obj: ConsType) {
    super(obj)
    console.log(this.toObject().player)
  }
  declare toObject: () => ReturnType<GgMsgBase['toObject']>
  //override toObject(): ReturnType<GgMsgBase['toObject']> { return super.toObject()}
  client_from: number
  get msgType() { return GgType[this.type] }
  get msgObject(): GgMessageOptsX {
    let msgObject = { msgType: `${this.msgType}(${this.type})`, ...this?.toObject() }
    if (msgObject.name.length == 0) delete msgObject.name
    if (msgObject.json.length == 0) delete msgObject.json
    if (msgObject.inform.length == 0) delete msgObject.inform
    if (msgObject.player == 0) delete msgObject.player // TODO: assign player=1 & player=2 ... allPlayers[!]
    if (!this.roster) delete msgObject.roster // bug in pbMessage.toObject()
    delete msgObject.type
    return msgObject
  }
  get msgString() { return json(this.msgObject) }

  static override deserialize<GgMessage>(data: Uint8Array) {
    let newMsg = undefined as GgMessage
    if (data == undefined) return newMsg
    newMsg = GgMsgBase.deserialize(data) as any as GgMessage
    if (newMsg instanceof GgMsgBase) {
      Object.setPrototypeOf(newMsg, GgMessage.prototype)
    }
    return newMsg
  }
}
// type GK = keyof GgMessage
// function foo(g: GK) {}
// const gg = new GgMessage({})
// gg.toObject()