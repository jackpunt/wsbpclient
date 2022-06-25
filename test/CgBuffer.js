//import { CgMessage } from '@thegraid/wspbclient'
import { CgMessage } from '../lib/CgProto.js'
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
    let msg2 = CgMessage.deserialize(data)
    console.log(`${ident} CgMessage =`, msg2) // TODO: parse inner if CgType == 'send'
  } catch { 
    console.log(`${ident} CgMessage = fail`)
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
showChromeAry(str1)

showHexString(`08 01 18 01 20 02 2a 04 63 6c 69 6b`)