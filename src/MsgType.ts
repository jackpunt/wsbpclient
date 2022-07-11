import { json, Obj, stime, type Constructor } from "@thegraid/common-lib";
import { CgMessage, CgType } from "./CgMessage.js";
import { GgType } from "./GgMessage.js"
import { CgMsgBase } from "./proto/CgProto.js";
import type { Empty } from "./proto/Empty.js";
import { GgMsgBase } from "./proto/GgProto.js";
import type { pbMessage } from "./types.js";

export interface MsgTypeFuncs {
  /** use class Proto extends MsgTypeMixin<MsgBase>(MsgBase) { ... } should override get type() */
  get type(): number
  /** Assert (typeof MsgBase.type extends GgType) */
  get msgType(): string
  /** override in public Proto class; edit this.toObject() */
  get msgObject(): {}
  /** json(this.msgObject()) */
  get msgString(): string
}
// type GGMKx = Exclude<keyof GgMsgBase, Partial<keyof pbMessage> | "serialize">
// export type GgMessageOpts = Partial<Pick<GgMsgBase, GGMKx>>


/** the bit that all the generate proto classes share: a 'type' field */
interface typedMsg { get type(): number }
type MsgTypeKeys = keyof typedMsg
interface msgWithType extends pbMessage, typedMsg {}
type xtype = keyof pbMessage | keyof Empty | keyof pbMessage

/** Augment a protoc-gen-ts pbMessage with MsgTypeFuncs, */
export function MsgTypeMixin<TBase extends Constructor<msgWithType>>(Base: TBase) {
  /** implement the abstract class pbMessage, to convince compiler that Base is usable */
  return class MsgTypeBase extends Base  {
    // pro-forma: reify abstract methods:
    toObject(includeInstance?: boolean) :
    {}
    // { -readonly [key in Exclude<keyof TBase, xtype>] : TBase[key]} 
    { throw new Error("Method not implemented."); }
    serializeBinary(): Uint8Array { throw new Error("Method not implemented."); }
    /** MsgTypeMixin.MsgTypeBase() */
    constructor(...args: any[]) {
      super(...args)  // invoke the given Base constructor: GgClientForRef
      delete MsgTypeBase.prototype.toObject;
      delete MsgTypeBase.prototype.serializeBinary;
      return
    }
    /** use class Proto extends MsgTypeMixin<MsgBase>(MsgBase) { ... } should override get type() */
    //get type(): number { return 0 }
    /** Assert (typeof MsgBase.type extends GgType) */
    get msgType() { return GgType[this.type]}
    /** override in public Proto class; edit this.toObject() */
    get msgObject() { return this.toObject() }
    /** json(this.msgObject()) */
    get msgString() { return json(this.msgObject) }
  
    /** protect (data == undefined) */
    static deserialize<T>(this: Constructor<T>, data: Uint8Array): T {
      let newMsg = undefined as T
      if (data == undefined) return newMsg
      try {
        newMsg = Base.prototype.deserialize(data)
        newMsg = Base['deserialize'](data)
        if (newMsg !== undefined) {
          Object.setPrototypeOf(newMsg, Base.prototype) // needs to be the derived Proto class!
        }
        return newMsg
      } catch (err) {
        console.warn(stime(Base, `.deserialize: failed`), err)
        return newMsg
      }
    }
  }
}
type CgMsgKeys = Exclude<keyof CgMsgBase, keyof pbMessage | "serialize">
type CgObjType = ReturnType<CgMsgBase['toObject']>
class MyCgMessage extends MsgTypeMixin(CgMsgBase) {
  
  constructor(obj: { -readonly [key in keyof Partial<Pick<CgMsgBase, CgMsgKeys>>] : CgMsgBase[key] }) {
    super()
    console.log(this.toObject())
  }
  override toObject(includeInstance?: boolean): ReturnType<CgMsgBase['toObject']> { return super.toObject() }

  //override toObject(includeInstance?: boolean): CgObjType { return super.toObject() }
  override get msgObject(): ReturnType<CgMsgBase['toObject']> {
    return super.msgObject
  }
}
const cgm = new MyCgMessage({type: CgType.join})

type GgMsgKeys = Exclude<keyof GgMsgBase, Partial<keyof pbMessage> | "serialize">
type GgConsObj = { -readonly [key in keyof Partial<Pick<GgMsgBase, GgMsgKeys>>] : GgMsgBase[key] }
type GgObjType = ReturnType<GgMsgBase['toObject']>

class MyGgMessage extends MsgTypeMixin(GgMsgBase) {
  constructor(obj: { -readonly [key in keyof Partial<Pick<GgMsgBase, GgMsgKeys>>] : GgMsgBase[key] }) {
    super(obj)
  }
  override toObject(includeInstance?: boolean): ReturnType<GgMsgBase['toObject']> { return super.toObject() }
  override get msgObject(): ReturnType<GgMsgBase['toObject']> {
    let n = (this as MyGgMessage).toObject(), k=n
    return super.msgObject
  }
}
const ggm = new MyGgMessage({type: GgType.chat})
let type = ggm.type, mg = ggm.msgObject
const x = {ggm, type, mg}

