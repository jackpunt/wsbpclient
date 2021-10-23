import moment = require('moment'); // import * as moment from 'moment';
import type * as jspb from 'google-protobuf';
export { EzPromise } from '@thegraid/ezpromise';

export interface pbMessage extends jspb.Message {}

/** 
 * websocket close codes.
 * 
 * https://docs.microsoft.com/en-us/dotnet/api/system.net.websockets.websocketclosestatus 
 */
export enum CLOSE_CODE { NormalCLosure = 1000, EndpointUnavailable = 1001, Empty = 1005 }
export type READY_STATE = Pick<WebSocket, "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED">
// CONNECTING = 0
// OPEN = 1
// CLOSING = 2
// CLOSED = 3

export type minWebSocket = {
  send: (data: any) => void,
  close: (code?: number, data?: string) => void,
  addEventListener: (method: string, listener: (event?: Event) => void) => void
}
/** a bytearray that decodes to type T */
export type DataBuf<T> = Uint8Array
export type AWebSocket = WebSocket

export function className (obj: { constructor: { name: any; }; }): string { 
  return (obj === undefined) ? 'undefined' : (!!obj && obj.constructor) ? obj.constructor.name : 'no_class'
}

/** timestamp & className for console logs. */
export function stime (obj?: { constructor: { name: string; }; }, f?: string) { 
  let name = obj ? (" "+className(obj)) : ""
  if (!!f) name = name + f
  return moment().format(stime.fmt) + name
}
stime.fmt = "MM-DD kk:mm:ss.SSS"

/**
 * While predicate returns truthy, invoke actionP and then recurse (when Promise is fulfilled)
 * @param pred if true then invoke actionP().then(-recurse-)
 * @param actionP preforms some computation and returns a Promise\<T>
 * @param v value: \<T> returned when actionP promise fulfills
 * @param args context args supplied to pred and actionP (v, ...args)
 */
export function whileP<T>(pred: (v?: T, ...args: any) => boolean, actionP: (v?: T, ...args: any) => Promise<T>, v?: T, ...args: any) {
  if (pred(v, ...args)) {
    let p = actionP(v, ...args)
    p.then((v: T) => whileP(pred, actionP, v, ...args))
  }
}

/**
 * Invoke actionP and then (when Promise is fulfilled) if (pred is false) recurse 
 * @param pred if false then (-recurse-)
 * @param actionP preforms some computation and returns a Promise\<T>
 * @param v value: \<T> returned when actionP promise fulfills
 * @param args context args supplied to pred and actionP (v, ...args)
 */
export function untilP<T>(pred: (v?: T, ...args: any) => boolean, actionP: (v?: T, ...args: any) => Promise<T>, v?: T, ...args: any) {
  let p = actionP(v, ...args)
  p.then((v: T) => !pred(v, ...args) && untilP(pred, actionP, v, ...args))
}

/** standard HTML [Web]Socket events, for client (& server ws.WebSocket) */
/** what the downstream invokes/sends_to this [upstream] Driver: */
export interface WebSocketEventHandler<I extends pbMessage> {
	onopen: (ev: Event) => void | null;  // { target: WebSocket }
	onerror: (ev: Event) => void | null; // { target: WebSocket, error: any, message: any, type: string }
	onclose: (ev: CloseEvent) => void | null; // { target: WebSocket, wasClean: boolean, code: number, reason: string; }
  onmessage(ev: MessageEvent<DataBuf<I>>): void | null // { target: WebSocket, data: any, type: string }
	wsmessage: (buf: DataBuf<I>, wrapper?: pbMessage) => void | null; // from downstream: bytes encoding my INPUT proto
}

export interface PbParser<T extends pbMessage> {
	deserialize(bytes: DataBuf<T>): T
	parseEval(message:T, ...args: any): void;
}
/** WebSocketDriver that can be linked by an upstream driver */
export interface UpstreamDrivable<O extends pbMessage> {
  /** set upstream driver, send bytes upstream */
  connectUpStream(wsd: WebSocketEventHandler<O>): void
  closeStream(code: CLOSE_CODE, reason: string): void
  sendBuffer(data: DataBuf<O>): void; // process message from upstream 
  //wsmessage: (buf: DataBuf<I>) => void | null; // process message coming from downstream
}

/** Generic [web] socket driver, pass message up-/down-stream to a connected WSD. */
export interface WebSocketDriver<I extends pbMessage, O extends pbMessage>
  extends WebSocketEventHandler<I>, UpstreamDrivable<O> {
  connectDnStream(dnstream: UpstreamDrivable<I>): this
}