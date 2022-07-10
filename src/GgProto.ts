import { json } from '@thegraid/common-lib'
import type { BinaryReader } from 'google-protobuf'
import { GgMessage as GgMsgBase } from './proto/GgProto.js'
import { GgType, Rost } from './proto/GgProto.js'
import type { pbMessage } from './types.js'
export { GgType, Rost } from './proto/GgProto.js'

/** GgMessage.Rost as interface: */
export type rost = { name: string, client: number, player: number }

type GGMK = Exclude<keyof GgMsgBase, Partial<keyof pbMessage> | "serialize">
/** keys to supply to new GgMessage() --> new GgMsgBase() */
export type GgMessageOpts = Partial<Pick<GgMessage, GGMK>>

/** typeof GgMesssge.toObject() */
type GGMKo = ReturnType<GgMessage["toObject"]>
export type GgMessageOptsX = GGMKo
export type GgMessageOptsY = GGMKo & { msgType: string }
export type GgMessageOptsW = { -readonly [key in keyof GgMessageOptsY] : GgMessageOptsY[key] }
  //   type CgMessageOptsW = { -readonly [key in keyof CgMessageOptsX] : CgMessageOptsX[key] }

export class GgMessage extends GgMsgBase {
  get msgType() { return GgType[this.type]}
  get msgObject(): GgMessageOptsX {
    let msgObject = this?.toObject() as GgMessageOptsW
    msgObject.msgType = `${this.msgType}(${this.type})`
    if (msgObject.name.length == 0) delete msgObject.name
    if (msgObject.json.length == 0) delete msgObject.json
    if (msgObject.inform.length == 0) delete msgObject.inform
    if (msgObject.player == 0) delete msgObject.player // TODO: assign player=1 & player=2 ... allPlayers[!]
    if (!this.roster) delete msgObject.roster // bug in pbMessage.toObject()
    delete msgObject.type
    return msgObject
  }
  get msgString() { return json(this.msgObject) }

  static override deserialize(data: Uint8Array | BinaryReader) {
    if (data == undefined) return undefined as GgMessage
    let newMsg = GgMsgBase.deserialize(data) as GgMessage
    if (newMsg instanceof GgMsgBase) {
      Object.setPrototypeOf(newMsg, GgMessage.prototype)
    }
    return newMsg
  }
}