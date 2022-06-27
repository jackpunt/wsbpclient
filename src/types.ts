import type * as jspb from 'google-protobuf';
export { stime, className } from '@thegraid/common-lib'; // not @thegraid/common-lib because createjs
export { EzPromise } from '@thegraid/ezpromise';

export interface pbMessage extends jspb.Message {}

/** 
 * websocket close codes.
 * 
 * https://docs.microsoft.com/en-us/dotnet/api/system.net.websockets.websocketclosestatus 
 */
export enum CLOSE_CODE { 
  NormalClosure = 1000, 
  EndpointUnavailable = 1001, 
  ProtocolError =	1002,
  Empty = 1005, 
  PolicyViolation	= 1008,
}
export type READY_STATE = Pick<WebSocket, "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED">
// CONNECTING = 0
// OPEN = 1
// CLOSING = 2
// CLOSED = 3
export type CloseInfo = { code: number, reason: string }
export function normalClose(reason:string): CloseInfo { return {code: CLOSE_CODE.NormalClosure, reason: reason}}
export const close_normal: CloseInfo = {code: CLOSE_CODE.NormalClosure, reason: "normal_closure" }
export const close_fail: CloseInfo = { code: CLOSE_CODE.Empty, reason: "failed"}
export function readyState (ws: WebSocket): string {
  return ["CONNECTING" , "OPEN" , "CLOSING" , "CLOSED"][ws.readyState]
}
export type minWebSocket = {
  send: (data: any) => void,
  close: (code?: number, data?: string) => void,
  addEventListener: (method: string, listener: (event?: Event) => void) => void
}
/** a bytearray that decodes to type T */
export type DataBuf<T> = Uint8Array
export type AWebSocket = WebSocket

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
  parseEval(message: T, ...args: any): void;
}
/** WebSocketDriver that can be linked by an upstream driver */
export interface UpstreamDrivable<O extends pbMessage> {
  /** set upstream driver, send bytes upstream */
  connectUpStream(wsd: WebSocketEventHandler<O>): void
  closeStream(code?: CLOSE_CODE, reason?: string): void
  sendBuffer(data: DataBuf<O>): void; // process message from upstream 
  //wsmessage: (buf: DataBuf<I>) => void | null; // process message coming from downstream
}

/** Generic [web] socket driver, pass message up-/down-stream to a connected WSD. */
export interface WebSocketDriver<I extends pbMessage, O extends pbMessage>
  extends WebSocketEventHandler<I>, UpstreamDrivable<O> {
  connectDnStream(dnstream: UpstreamDrivable<I>): this
}