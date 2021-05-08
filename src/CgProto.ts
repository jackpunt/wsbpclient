import * as pb_1 from "google-protobuf";
export enum CgType {
    none = 0,
    ack = 1,
    send = 2,
    join = 3,
    leave = 4
}
export class CgMessage extends pb_1.Message {
    constructor(data?: any[] | {
        type?: CgType;
        client_id?: number;
        success?: boolean;
        msg?: Uint8Array;
        group?: string;
        cause?: string;
        nocc?: boolean;
        client_from?: number;
    }) {
        super();
        pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [], []);
        if (!Array.isArray(data) && typeof data == "object") {
            if ("type" in data && data.type != undefined) {
                this.type = data.type;
            }
            if ("client_id" in data && data.client_id != undefined) {
                this.client_id = data.client_id;
            }
            if ("success" in data && data.success != undefined) {
                this.success = data.success;
            }
            if ("msg" in data && data.msg != undefined) {
                this.msg = data.msg;
            }
            if ("group" in data && data.group != undefined) {
                this.group = data.group;
            }
            if ("cause" in data && data.cause != undefined) {
                this.cause = data.cause;
            }
            if ("nocc" in data && data.nocc != undefined) {
                this.nocc = data.nocc;
            }
            if ("client_from" in data && data.client_from != undefined) {
                this.client_from = data.client_from;
            }
        }
    }
    get type() {
        return pb_1.Message.getField(this, 1) as CgType;
    }
    set type(value: CgType) {
        pb_1.Message.setField(this, 1, value);
    }
    get client_id() {
        return pb_1.Message.getField(this, 2) as number;
    }
    set client_id(value: number) {
        pb_1.Message.setField(this, 2, value);
    }
    get success() {
        return pb_1.Message.getField(this, 3) as boolean;
    }
    set success(value: boolean) {
        pb_1.Message.setField(this, 3, value);
    }
    get msg() {
        return pb_1.Message.getField(this, 4) as Uint8Array;
    }
    set msg(value: Uint8Array) {
        pb_1.Message.setField(this, 4, value);
    }
    get group() {
        return pb_1.Message.getField(this, 5) as string;
    }
    set group(value: string) {
        pb_1.Message.setField(this, 5, value);
    }
    get cause() {
        return pb_1.Message.getField(this, 6) as string;
    }
    set cause(value: string) {
        pb_1.Message.setField(this, 6, value);
    }
    get nocc() {
        return pb_1.Message.getField(this, 7) as boolean;
    }
    set nocc(value: boolean) {
        pb_1.Message.setField(this, 7, value);
    }
    get client_from() {
        return pb_1.Message.getField(this, 8) as number;
    }
    set client_from(value: number) {
        pb_1.Message.setField(this, 8, value);
    }
    toObject() {
        var data: {
            type?: CgType;
            client_id?: number;
            success?: boolean;
            msg?: Uint8Array;
            group?: string;
            cause?: string;
            nocc?: boolean;
            client_from?: number;
        } = {};
        if (this.type != null) {
            data.type = this.type;
        }
        if (this.client_id != null) {
            data.client_id = this.client_id;
        }
        if (this.success != null) {
            data.success = this.success;
        }
        if (this.msg != null) {
            data.msg = this.msg;
        }
        if (this.group != null) {
            data.group = this.group;
        }
        if (this.cause != null) {
            data.cause = this.cause;
        }
        if (this.nocc != null) {
            data.nocc = this.nocc;
        }
        if (this.client_from != null) {
            data.client_from = this.client_from;
        }
        return data;
    }
    serialize(w?: pb_1.BinaryWriter): Uint8Array | undefined {
        const writer = w || new pb_1.BinaryWriter();
        if (this.type !== undefined)
            writer.writeEnum(1, this.type);
        if (this.client_id !== undefined)
            writer.writeInt32(2, this.client_id);
        if (this.success !== undefined)
            writer.writeBool(3, this.success);
        if (this.msg !== undefined)
            writer.writeBytes(4, this.msg);
        if (typeof this.group === "string" && this.group.length)
            writer.writeString(5, this.group);
        if (typeof this.cause === "string" && this.cause.length)
            writer.writeString(6, this.cause);
        if (this.nocc !== undefined)
            writer.writeBool(7, this.nocc);
        if (this.client_from !== undefined)
            writer.writeInt32(8, this.client_from);
        if (!w)
            return writer.getResultBuffer();
    }
    static deserialize(bytes: Uint8Array | pb_1.BinaryReader): CgMessage {
        const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes), message = new CgMessage();
        while (reader.nextField()) {
            if (reader.isEndGroup())
                break;
            switch (reader.getFieldNumber()) {
                case 1:
                    message.type = reader.readEnum();
                    break;
                case 2:
                    message.client_id = reader.readInt32();
                    break;
                case 3:
                    message.success = reader.readBool();
                    break;
                case 4:
                    message.msg = reader.readBytes();
                    break;
                case 5:
                    message.group = reader.readString();
                    break;
                case 6:
                    message.cause = reader.readString();
                    break;
                case 7:
                    message.nocc = reader.readBool();
                    break;
                case 8:
                    message.client_from = reader.readInt32();
                    break;
                default: reader.skipField();
            }
        }
        return message;
    }
    serializeBinary(): Uint8Array {
        return this.serialize();
    }
    static deserializeBinary(bytes: Uint8Array): CgMessage {
        return CgMessage.deserialize(bytes);
    }
}
