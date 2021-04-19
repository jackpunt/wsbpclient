import { CgBase } from './CgBase'
import type { pbMessage } from './types';


/** 
 * A web client using CgProto (client-group.proto)
 * 
 * Example usage:
 * 
 * let wsb = new WebSocketBase();
 * 
 * let cgc = new CgClient<CmMessage>().connetToStream(wsb)
 * 
 * let cmc = new CmClient<never>().connectToStream(cgc)
 * 
 * wsb.connectws(URL)
 * 
 * OR: new WebSocketBase().connectStream(URL, CgClient<CmMessage>, CmClient<never>)
 * 
 */
export class CgClient<O extends pbMessage> extends CgBase<O>  {
  /**
   * 
   * @returns true if this CgClientCnx has role of Referee
   */
  isClient0(): boolean { return this.client_id === 0 }

}