import { stime } from "@thegraid/common-lib"
import { execSync } from "child_process"
import type { AWebSocket, CgBase, CgMessage, pbMessage, WebSocketBase } from "../src/index.js"
import { AnyWSD, CgClient, close_normal, wsWebSocketBase } from '../src/index.js'

export function listTCPsockets(pid = `${process.pid}`) {
  let lsofTCP = execSync(`(lsof -P -i TCP -a -p ${pid}; cat)`, {stdio: ['ignore', 'pipe', 'ignore']} ).toString()
  let lines = lsofTCP.split('\n')
  let header = lines[0]
  let afterHeader = lines.slice(1, -1)
  console.log(stime(undefined, `listTCPsockets(${pid}): ${afterHeader.length} sockets`), afterHeader)
  return afterHeader
}

//export type WSDriver = (new () => AnyWSD)
export type Driver = (new () => AnyWSD)
type Listeners = { open?: EventListenerOrEventListenerObject, close?: EventListenerOrEventListenerObject, error?: EventListenerOrEventListenerObject, message?: EventListenerOrEventListenerObject }

/** make websocket driver stack, with the given Driver. 
 * @param driver typically CgClient [or CgBase<CgMessage>] 
 * @return the new driver() on top of stack.
 */
export function makeCgClient<C extends CgBase<CgMessage>>
    (url: string | AWebSocket, listeners: Listeners = {}, driver: Driver = CgClient)
  : { wsbase: wsWebSocketBase<pbMessage, pbMessage>, cgclient: C } {
  let wsbase = new wsWebSocketBase<pbMessage, CgMessage>()
  let stack = wsbase.connectStream(url, driver) // stack driver[s] *then* connect to url
  let cgclient = stack[1] as CgClient<CgMessage>  as C // stack[0] === wsbase
  //console.log(stime('', `.makeCgClient: cgclient=`), cgclient)
  listeners.open && cgclient.addEventListener('open', listeners.open)
  listeners.close && cgclient.addEventListener('close', listeners.close)
  listeners.error && cgclient.addEventListener('error', listeners.error)
  listeners.message && cgclient.addEventListener('message', listeners.message)
  return { wsbase, cgclient }
}

export function closeStream(wsbase: WebSocketBase<pbMessage, pbMessage>, logmsg: string = '', closer?: (ev?: CloseEvent)=>void) {
  console.log(stime(), `${logmsg} try closeStream(normal, '${close_normal.reason}')`)
  !!closer && wsbase.addEventListener('close', closer)
  try {
    wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
  } catch (err) {
    console.log(stime(), `${logmsg} closeStream error:`, err)
  }
  listTCPsockets()
}