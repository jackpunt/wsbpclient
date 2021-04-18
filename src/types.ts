import * as moment from 'moment';
import type * as jspb from 'google-protobuf';
export { EzPromise } from '../../ezpromise'

//export EzPromise;
export interface pbMessage extends jspb.Message {}


/** 
 * websocket close codes.
 * 
 * https://docs.microsoft.com/en-us/dotnet/api/system.net.websockets.websocketclosestatus 
 */
export enum CLOSE_CODE { NormalCLosure = 1000, EndpointUnavailable = 1001, Empty = 1005 }

/** a bytearray that decodes to type T */
export type DataBuf<T> = Uint8Array
export type AWebSocket = WebSocket

export const fmt = "YYYY-MM-DD kk:mm:ss.SSS"
export function stime () { return moment().format(fmt) }

/** standard HTML [Web]Socket events, for client (& server ws.WebSocket) */
export interface WebSocketEventHandler<I> {
	onopen: (ev: Event) => void | null;  // { target: WebSocket }
	onerror: (ev: Event) => void | null; // { target: WebSocket, error: any, message: any, type: string }
	onclose: (ev: CloseEvent) => void | null; // { target: WebSocket, wasClean: boolean, code: number, reason: string; }
	//onmessage: (ev: MessageEvent<I>) => void | null; // { target: WebSocket, data: any, type: string }
	wsmessage: (buf: DataBuf<I>) => void | null; // from ws.WebSocket Node.js server (buf: {any[] | Buffer })
}

export interface PbParser<T extends pbMessage> {
	deserialize(bytes: DataBuf<T>): T
	parseEval(message:T, ...args:any): void;
}

/** Generic [web] socket driver, pass message up-/down-stream to a connected WSD. */
export interface WebSocketDriver<I,O> extends WebSocketEventHandler<I> {
  connect(wsd: WebSocketDriver<O, any>): void
  sendBuffer(data: DataBuf<O>, ecb?: (error: Event | Error) => void): void; // process message from upstream 
  //wsmessage: (buf: DataBuf<I>) => void | null; // process message coming from downstream
}