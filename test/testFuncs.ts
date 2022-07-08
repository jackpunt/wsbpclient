import { stime } from "@thegraid/common-lib"
import { execSync } from "child_process"
import { AWebSocket, CgBase, CgMessage, GgClient, pbMessage, WebSocketBase } from "../src/index.js"
import { AnyWSD, CgClient, close_normal } from '../src/index.js'
import { wsWebSocketBase } from '../src/wsWebSocketBase.js'

import type net from 'net'
import { WebSocket as ws$WebSocket } from "ws"
import { GgMessage } from "../src/GgProto.js"
//net.Socket
export function wssPort(wsb: wsWebSocketBase<pbMessage, pbMessage>, def: number = undefined) {
  let wss = wsb.ws['wss']
  if (wss instanceof ws$WebSocket) {
    let socket = wss['_socket'] as net.Socket
    //console.log(`wsPort: socket =`, socket)
    return socket.localPort || def
  }
  return def
}
export type Listener = (ev: Event | any) => void
export type Listeners2 = {
  open?: Listener, 
  close?: Listener, 
  error?: Listener, 
  message?: Listener,
  leave?: Listener,
}


type Listeners = { 
  open?: EventListenerOrEventListenerObject, 
  close?: EventListenerOrEventListenerObject, 
  error?: EventListenerOrEventListenerObject, 
  message?: EventListenerOrEventListenerObject,
  leave?: EventListenerOrEventListenerObject,
}

export function listTCPsockets(ident = '.listTCPsockets', pid = `${process.pid}`) {
  let lsofTCP = execSync(`(lsof -P -i TCP -a -p ${pid}; cat)`, {stdio: ['ignore', 'pipe', 'ignore']} ).toString()
  let lines = lsofTCP.split('\n')
  let header = lines[0]
  let afterHeader = lines.slice(1, -1)
  console.log(stime(undefined, `${ident}(${pid}): ${afterHeader.length} sockets`), afterHeader)
  return afterHeader
}

//export type WSDriver = (new () => AnyWSD)
export type Driver = (new () => AnyWSD)

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
  addListeners(cgclient, listeners)
  return { wsbase, cgclient }
}
export function makeGgClient(url: string, listeners: Listeners2 = {}) {
  let ggclient = new GgClient(GgMessage, CgBase, wsWebSocketBase, url, listeners.open)
  let cgbase = ggclient.dnstream as CgBase<GgMessage>
  let wsbase = cgbase.dnstream as wsWebSocketBase<pbMessage, CgMessage>
  return { ggclient, cgbase, wsbase }
}
export function addListeners<CgM extends pbMessage>(cgclient: CgClient<CgM>, listeners: Listeners = {}) {
  listeners.open && cgclient.addEventListener('open', listeners.open)
  listeners.close && cgclient.addEventListener('close', listeners.close)
  listeners.error && cgclient.addEventListener('error', listeners.error)
  listeners.message && cgclient.addEventListener('message', listeners.message)
}

export function closeStream(wsbase: WebSocketBase<pbMessage, pbMessage>, logmsg: string = '', closer?: (ev?: CloseEvent)=>void) {
  console.log(stime(), `${logmsg} try closeStream(normal, '${close_normal.reason}')`)
  logmsg.length>0 && listTCPsockets(`closeStream:A ${logmsg}`)
  !!closer && wsbase.addEventListener('close', closer)
  try {
    wsbase.closeStream(close_normal.code, close_normal.reason) // wsbase.ws.close(code, reason)
  } catch (err) {
    console.log(stime(), `${logmsg} closeStream error:`, err)
  }
  logmsg.length>0 && listTCPsockets(`closeStream:B ${logmsg}`)
}
