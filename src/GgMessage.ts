import { Constructor, json } from '@thegraid/common-lib';
import * as jspb from 'google-protobuf';  // pb_1
import { GgMsgBase, GgType, Rost } from './proto/GgProto.js';
import type { pbMessage } from './types.js';
export { GgType, Rost } from './proto/GgProto.js';

/** extendible/implementable interface to GgMessage (sans #private) */
export interface IGgMessage extends pbMessage { 
  type: number;       // message_id: number from compatible enum...
  client: number;     // client_id: from ClientGroup; ref sets { client, player, name }
  player: number;     // player_id: serial #; large values indicate observer or referee (237)
  name: string;       // player name (provide when joining, must be unique w/in the Group)
  roster: Rost[];     // { client: client_id, player: player_id, name: name }
  client_to: number;  // from CgMessage: wrapper.client_id  [referee checks on join]
  inform: string;     // information string for logging/debugging
  /** type as a string (vs enum value) */
  get msgType(): string // typically injected into pbMessage<Ioc extends GgMessage>
  get msgObject(): { msgType?: string }
  get msgString(): string
  // declare module "src/IoCproto" { interface IoC { msgType: string }}; addEnumTypeString(IoC)
  toObject(): { type?: number }
  // static deserialize(buf: DataBuf<any>): this
}
// https://github.com/microsoft/TypeScript/issues/41347
// TS-4.6.2 does not allow Mixins to have override-able get accessors [d.ts cannot tell property from accessor]
// so we will forego 'extends MsgTypeMixin(GgMsgBase)' until that is fixed (fixed May 2022...)

/** add methods to GgMsgBase. */
export class GgMessage extends (GgMsgBase) implements IGgMessage {
  declare toObject: () => ReturnType<GgMsgBase['toObject']>
  //override toObject(): ReturnType<GgMsgBase['toObject']> { return super.toObject()}
  client_from: number
  get msgType() { return GgType[this.type] }
  get msgObject(): GgMessageOptsX {
    let msgObject = { msgType: `${this.msgType}(${this.type})`, ...this?.toObject() }
    if (!this.has_client) delete msgObject.client
    if (!this.has_player) delete msgObject.player
    if (!this.has_name) delete msgObject.name
    if (!this.has_json) delete msgObject.json
    if (!this.has_inform) delete msgObject.inform
    if (!this.has_roster) delete msgObject.roster // bug? in pbMessage.toObject()
    if (!this.has_client_to) delete msgObject.client_to
    delete msgObject.type
    return msgObject
  }
  get msgString() { return json(this.msgObject) }

  /** deletage to GgMsgBase.derserialize, but inject GgMessage methods. */
  static override deserialize<GgMessage>(data: Uint8Array) {
    let newMsg = undefined as GgMessage
    if (data == undefined) return newMsg
    newMsg = GgMsgBase.deserialize(data) as any as GgMessage
    if (newMsg instanceof GgMsgBase) {
      Object.setPrototypeOf(newMsg, GgMessage.prototype)
    }
    return newMsg
  }

  // string name    = 4;    // playerName for join; roster[client_id] -> [player,client,name]
  // string json    = 5;    // JSON for various payloads
  // string inform  = 7;    // extra string
  // repeated Rost roster = 10; // players, observers, referee 

  // these could be made #private methods...?
  get has_type(): boolean { return jspb.Message.getField(this, 1) != null; }
  get has_client(): boolean { return jspb.Message.getField(this, 2) != null; }
  get has_player(): boolean { return jspb.Message.getField(this, 3) != null; }
  get has_name(): boolean { return jspb.Message.getField(this, 4) != null; }
  get has_json(): boolean { return jspb.Message.getField(this, 5) != null; }
  get has_inform(): boolean { return jspb.Message.getField(this, 7) != null; }
  get has_roster(): boolean { return this.roster?.length > 0; }
  get has_client_to(): boolean { return jspb.Message.getField(this, 11) != null; }

}
/** GgMessage.Rost as interface: */
export type rost = { name: string, client: number, player: number }

type GGMK = Exclude<keyof GgMsgBase, Partial<keyof pbMessage> | "serialize">
/** keys to supply to new GgMessage() --> new GgMsgBase() */
export type GgMessageOpts = Partial<Pick<GgMsgBase, GGMK>>
export type GgMessageOptT = Partial<Pick<GgMsgBase, Exclude<GGMK, 'type'>>>

/** typeof GgMesssge.toObject() */
export type GgMessageOptsX = ReturnType<GgMsgBase["toObject"]> & { msgType: string }
/** typeof GgMessage.msgObject */
export type GgMessageOptsW = { -readonly [key in keyof GgMessageOptsX] : GgMessageOptsX[key] }

type MsgKeys = Exclude<keyof GgMsgBase, Partial<keyof pbMessage> | "serialize">
type ConsType = { -readonly [key in keyof Partial<Pick<GgMsgBase, MsgKeys>>] : GgMsgBase[key] }
type ObjType = ReturnType<GgMsgBase['toObject']>


export function GgMsgMixin<TBase extends Constructor<IGgMessage>>(Base: TBase) {
  return class GgMixinBase extends Base {
    constructor(...args: any[]) {
      super(...args)
      delete GgMixinBase.prototype.serializeBinary;
    }
    serializeBinary(): Uint8Array { throw new Error('Method not implemented.') }
    declare toObject: () => ReturnType<GgMsgBase['toObject']>
    //override toObject(): ReturnType<GgMsgBase['toObject']> { return super.toObject()}
    client_from: number
    override get msgType() { return GgType[this.type] }
    override get msgObject(): GgMessageOptsX {
      let msgObject = { msgType: `${this.msgType}(${this.type})`, ...this?.toObject() }
      if (msgObject.name.length == 0) delete msgObject.name
      if (msgObject.json.length == 0) delete msgObject.json
      if (msgObject.inform.length == 0) delete msgObject.inform
      if (msgObject.player == 0) delete msgObject.player // TODO: assign player=1 & player=2 ... allPlayers[!]
      if (!this.roster) delete msgObject.roster // bug in pbMessage.toObject()
      delete msgObject.type
      return msgObject
    }
    override get msgString() { return json(this.msgObject) }

    // static override deserialize<GgMessage>(data: Uint8Array) {
    //   let newMsg = undefined as GgMessage
    //   if (data == undefined) return newMsg
    //   newMsg = GgMsgBase.deserialize(data) as any as GgMessage
    //   if (newMsg instanceof GgMsgBase) {
    //     Object.setPrototypeOf(newMsg, GgMessage.prototype)
    //   }
    //   return newMsg
    // }
  }
}
