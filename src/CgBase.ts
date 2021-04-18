import { BaseDriver } from "./BaseDriver";
import type { DataBuf, pbMessage, WebSocketDriver } from "./types";


class CgBase<I extends DataBuf<pbMessage>> extends BaseDriver<I, any> implements WebSocketDriver<pbMessage, DataBuf<any>> {

}