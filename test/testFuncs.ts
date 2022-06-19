import { stime } from "@thegraid/common-lib"
import { execSync } from "child_process"
import { close_normal, close_fail, wsWebSocketBase, CgClient, AnyWSD } from '../src/index.js'
import type { AWebSocket, CgBase, CgMessage, WebSocketBase, pbMessage  } from "../src/index.js"

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

export function makeCgClient<C extends CgBase<CgMessage>>
    (url: string | AWebSocket, listeners: Listeners = {}, driver: Driver = CgClient)
  : { wsbase: wsWebSocketBase<pbMessage, pbMessage>, cgclient: C } {
  let wsbase = new wsWebSocketBase()
  let stack = wsbase.connectStream(url, driver) // stack driver[s] *then* connect to url
  let cgclient = stack[1] as CgBase<CgMessage>
  listeners.open && cgclient.addEventListener('open', listeners.open)
  listeners.close && cgclient.addEventListener('close', listeners.close)
  listeners.error && cgclient.addEventListener('error', listeners.error)
  listeners.message && cgclient.addEventListener('message', listeners.message)
  return { wsbase, cgclient: cgclient as C }
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