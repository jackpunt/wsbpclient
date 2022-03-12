import { WebSocketBase } from './BaseDriver';
import { CgBase } from './CgBase'
import type { CgMessage } from './CgProto';
import type { pbMessage } from './types';

/** 
 * A WebSocketDriver for CgProto (client-group.proto)
 * 
 * Example usage:
 * 
 * let wsb = new WebSocketBase();  
 * let cgc = new CgClient\<CmMessage>().connetDnStream(wsb)  
 * let cmc = new CmClient\<never>().connectDnStream(cgc)  
 * wsb.connectws(URL)
 * 
 * OR: new WebSocketBase().connectStream(URL, CgClient\<CmMessage>, CmClient\<never>)
 * 
 */
export class CgClient<O extends pbMessage> extends CgBase<O>  {

}