//import { CgMessage } from '@thegraid/wspbclient'
import { CgMessage, CgType } from '../lib/CgProto.js'


function charString(char) { return (char >= 32 && char < 127) ? String.fromCharCode(char) : `\\${char.toString(10)}`}
function msgType() {
  let thss = (this), type = thss.type
  return (type !== CgType.ack) ? CgType[type] : this.success ? 'Ack' : 'Nak'
}
function msgPeek() {
  let thss = (this), msg = thss.msg
  return (msg !== undefined) ? `${thss.msgType}[${msg[1]}+${msg.length}]` : undefined //`${this.cgType}(${this.cause || this.success})`)
}
function msgStr() {
  let { msg, msgType } = (this)
  if (msg === undefined) return undefined
  let bytes = new Uint8Array(msg).slice(2), strs = []
  bytes.forEach(char => strs.push(charString(char)))
  return `${msgType}[${msg[1]}+${msg.length}${":".concat(...strs)}]`
}

// add methods to the objects created by new CgMessage()
Object.defineProperties(CgMessage.prototype, {
  // return CgType as a string
  'msgType': {
    get: function msgType() {
      let thss = (this), type = thss.type
      return (type !== CgType.ack) ? CgType[type] : this.success ? 'Ack' : 'Nak'
    }
  }
  ,
  // short string [type + length] of inner 'msg' of send/ack
  'msgPeek': {
    get: function msgPeek() {
      let thss = (this), msg = thss.msg
      return (msg !== undefined) ? `${thss.msgType}[${msg[1]}+${msg.length}]` : undefined //`${this.cgType}(${this.cause || this.success})`)
    }
  }
  , 
  // full charString of inner 'msg' or send/ack
  'msgStr': {
    get: function msgStr() {
      let msg = this.msg
      if (msg === undefined) return undefined
      let bytes = new Uint8Array(msg).slice(0), strs = []
      bytes.forEach(char => strs.push(charString(char)))
      return `${this.msgPeek}${":".concat(...strs)}]`
    }
  }
})

CgMessage.prototype.outObject2 = function() {
  let proto = CgMessage.prototype //Object.getPrototypeOf(CgMessage) ??
  console.log('proto', proto, Object.getOwnPropertyNames(proto))
  let thss = this
  //return
  let msgType = thss.msgType  // every CgMessage has a msgType
  let msgObj = { msgType }
  for (let key of Object.getOwnPropertyNames(proto)) {
    if (['msg', 'msgPeek', 'msgType', 'constructor', 'outObject2', 'outObject', 'toObject', 'serialize', 'serializeBinary'].includes(key)) continue
    let val = thss[key], desc = Object.getOwnPropertyDescriptor(proto, key)
    console.log(`key=${key}, val = ${val}, desc=${desc?.get}`)
    if (val !== undefined && (typeof val === 'function')) {
        val = desc ? desc.get.call(thss) : val.call(thss)
    }
    if (val !== undefined) msgObj[key] = val
  }
  return msgObj
}
CgMessage.prototype.outObject = function() {
  let thss = this
  let msgType = thss.msgType, msgObj = {}  // every CgMessage has a msgType
  msgObj[`msgType_${thss.type}`] = msgType
  if (thss.client_id !== undefined) msgObj.client_id = thss.client_id
  if (thss.success !== undefined) msgObj.success = thss.success
  if (thss.client_from !== undefined) msgObj.client_from = thss.client_from
  if (thss.cause !== undefined) msgObj.cause = thss.cause 
  if (thss.info !== undefined) msgObj.info = thss.info
  if (thss.ident !== undefined) msgObj.ident = thss.ident
  if (thss.group !== undefined) msgObj.group = thss.group
  if (thss.nocc !== undefined) msgObj.nocc = thss.nocc
  if (thss.msg !== undefined) msgObj.msgStr = thss.msgStr
  if (thss.acks?.length > 0) msgObj.acks = thss.acks
  return msgObj
}
/** convert Array.string [from Chrome] to UInt8Array protobuf data */
function cStringTo8Ary(str) {
  let ary = str.split('\n'), ary2 = []
  ary.forEach(line => {
    try {
    let [n, v] = line.split(':'); 
    ary2[Number.parseInt(n)] = Number.parseInt(v) 
    } catch {} // ignore non-parseable lines
  })
  let ary3 = new Uint8Array(ary2)
  return ary3
}
/** convert protobuf.data.toString back to protobuf data  */
function hexStringTo8Ary(str) {
    return new Uint8Array(str.split(' ').map(v => Number.parseInt(v, 16)))
}
function stringData(data) {
  let k = data.filter(v => v >= 32 && v <= 126)
  return String.fromCharCode(...k)
}
function showArray(data, ident='') {
  console.log(`\n${ident} Strings = "${stringData(data)}"`)
  //console.log(`${ident} Data =`, data)
  try {
    let msg2 = CgMessage.deserialize(data)  // TODO: parse inner if CgType == 'send'
    //console.log(`${ident} Xtype =`, msg2.msgType, `[${msg2.msgStr?msg2.msgStr:''}]`, msg2) // TODO: parse inner if CgType == 'send'
    console.log(`${ident} Ytype =`, msg2.msgType, msg2.outObject2())
    console.log(`${ident} Ztype =`, msg2.msgType, msg2.outObject())
  } catch (err) { 
    console.log(`${ident} CgMessage = fail: `, err)
  }
}
function showHexString(str) {
  showArray(hexStringTo8Ary(str), 'HexArray:')
}

// backquote works with literal linefeed:
function showChromeAry(str) {
  showArray(cStringTo8Ary(str), 'ChromeAry:')
}
// Paste console.log output here:
let str1 = `0: 66\n1: 68\n`;
//showChromeAry(str1)

//showHexString(`08 03 10 00 2a 07 72 65 66 65 72 65 65 4a 0d 68 65 78 6c 69 6e 65 3a 67 61 6d 65 31`)
showHexString(`08 02 20 01 42 1c 08 01 18 00 22 16 0a 10 70 6c 61 79 65 72 30 2d 52 45 44 2d 44 69 73 74 10 00 20 01`)