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
        client_from?: number;
        cause?: string;
        info?: string;
        ident?: number;
        msg?: Uint8Array;
        group?: string;
        nocc?: boolean;
        acks?: CgMessage[];
    }) {
        super();
        pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [11], []);
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
            if ("client_from" in data && data.client_from != undefined) {
                this.client_from = data.client_from;
            }
            if ("cause" in data && data.cause != undefined) {
                this.cause = data.cause;
            }
            if ("info" in data && data.info != undefined) {
                this.info = data.info;
            }
            if ("ident" in data && data.ident != undefined) {
                this.ident = data.ident;
            }
            if ("msg" in data && data.msg != undefined) {
                this.msg = data.msg;
            }
            if ("group" in data && data.group != undefined) {
                this.group = data.group;
            }
            if ("nocc" in data && data.nocc != undefined) {
                this.nocc = data.nocc;
            }
            if ("acks" in data && data.acks != undefined) {
                this.acks = data.acks;
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
    get client_from() {
        return pb_1.Message.getField(this, 4) as number;
    }
    set client_from(value: number) {
        pb_1.Message.setField(this, 4, value);
    }
    get cause() {
        return pb_1.Message.getField(this, 5) as string;
    }
    set cause(value: string) {
        pb_1.Message.setField(this, 5, value);
    }
    get info() {
        return pb_1.Message.getField(this, 6) as string;
    }
    set info(value: string) {
        pb_1.Message.setField(this, 6, value);
    }
    get ident() {
        return pb_1.Message.getField(this, 7) as number;
    }
    set ident(value: number) {
        pb_1.Message.setField(this, 7, value);
    }
    get msg() {
        return pb_1.Message.getField(this, 8) as Uint8Array;
    }
    set msg(value: Uint8Array) {
        pb_1.Message.setField(this, 8, value);
    }
    get group() {
        return pb_1.Message.getField(this, 9) as string;
    }
    set group(value: string) {
        pb_1.Message.setField(this, 9, value);
    }
    get nocc() {
        return pb_1.Message.getField(this, 10) as boolean;
    }
    set nocc(value: boolean) {
        pb_1.Message.setField(this, 10, value);
    }
    get acks() {
        return pb_1.Message.getRepeatedWrapperField(this, CgMessage, 11) as CgMessage[];
    }
    set acks(value: CgMessage[]) {
        pb_1.Message.setRepeatedWrapperField(this, 11, value);
    }
    toObject() {
        var data: {
            type?: CgType;
            client_id?: number;
            success?: boolean;
            client_from?: number;
            cause?: string;
            info?: string;
            ident?: number;
            msg?: Uint8Array;
            group?: string;
            nocc?: boolean;
            acks?: ReturnType<typeof CgMessage.prototype.toObject>[];
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
        if (this.client_from != null) {
            data.client_from = this.client_from;
        }
        if (this.cause != null) {
            data.cause = this.cause;
        }
        if (this.info != null) {
            data.info = this.info;
        }
        if (this.ident != null) {
            data.ident = this.ident;
        }
        if (this.msg != null) {
            data.msg = this.msg;
        }
        if (this.group != null) {
            data.group = this.group;
        }
        if (this.nocc != null) {
            data.nocc = this.nocc;
        }
        if (this.acks != null) {
            data.acks = this.acks.map((item: CgMessage) => item.toObject());
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
        if (this.client_from !== undefined)
            writer.writeInt32(4, this.client_from);
        if (typeof this.cause === "string" && this.cause.length)
            writer.writeString(5, this.cause);
        if (typeof this.info === "string" && this.info.length)
            writer.writeString(6, this.info);
        if (this.ident !== undefined)
            writer.writeInt32(7, this.ident);
        if (this.msg !== undefined)
            writer.writeBytes(8, this.msg);
        if (typeof this.group === "string" && this.group.length)
            writer.writeString(9, this.group);
        if (this.nocc !== undefined)
            writer.writeBool(10, this.nocc);
        if (this.acks !== undefined)
            writer.writeRepeatedMessage(11, this.acks, (item: CgMessage) => item.serialize(writer));
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
                    message.client_from = reader.readInt32();
                    break;
                case 5:
                    message.cause = reader.readString();
                    break;
                case 6:
                    message.info = reader.readString();
                    break;
                case 7:
                    message.ident = reader.readInt32();
                    break;
                case 8:
                    message.msg = reader.readBytes();
                    break;
                case 9:
                    message.group = reader.readString();
                    break;
                case 10:
                    message.nocc = reader.readBool();
                    break;
                case 11:
                    reader.readMessage(message.acks, () => pb_1.Message.addToRepeatedWrapperField(message, 11, CgMessage.deserialize(reader), CgMessage));
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
