/**
 * Generated by the protoc-gen-ts.  DO NOT EDIT!
 * compiler version: 3.15.8
 * source: GgProto.proto
 * git: https://github.com/thesayyn/protoc-gen-ts */
import * as pb_1 from "google-protobuf";
export enum GgType {
    none = 0,
    next = 6,
    undo = 7,
    join = 8,
    chat = 9
}
export class Rost extends pb_1.Message {
    constructor(data?: any[] | {
        client?: number;
        player?: number;
        name?: string;
    }) {
        super();
        pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [], []);
        if (!Array.isArray(data) && typeof data == "object") {
            if ("client" in data && data.client != undefined) {
                this.client = data.client;
            }
            if ("player" in data && data.player != undefined) {
                this.player = data.player;
            }
            if ("name" in data && data.name != undefined) {
                this.name = data.name;
            }
        }
    }
    get client() {
        return pb_1.Message.getField(this, 2) as number;
    }
    set client(value: number) {
        pb_1.Message.setField(this, 2, value);
    }
    get player() {
        return pb_1.Message.getField(this, 3) as number;
    }
    set player(value: number) {
        pb_1.Message.setField(this, 3, value);
    }
    get name() {
        return pb_1.Message.getField(this, 4) as string;
    }
    set name(value: string) {
        pb_1.Message.setField(this, 4, value);
    }
    static fromObject(data: {
        client?: number;
        player?: number;
        name?: string;
    }) {
        const message = new Rost({});
        if (data.client != null) {
            message.client = data.client;
        }
        if (data.player != null) {
            message.player = data.player;
        }
        if (data.name != null) {
            message.name = data.name;
        }
        return message;
    }
    toObject() {
        const data: {
            client?: number;
            player?: number;
            name?: string;
        } = {};
        if (this.client != null) {
            data.client = this.client;
        }
        if (this.player != null) {
            data.player = this.player;
        }
        if (this.name != null) {
            data.name = this.name;
        }
        return data;
    }
    serialize(): Uint8Array;
    serialize(w: pb_1.BinaryWriter): void;
    serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
        const writer = w || new pb_1.BinaryWriter();
        if (this.client !== undefined)
            writer.writeInt32(2, this.client);
        if (this.player !== undefined)
            writer.writeInt32(3, this.player);
        if (typeof this.name === "string" && this.name.length)
            writer.writeString(4, this.name);
        if (!w)
            return writer.getResultBuffer();
    }
    static deserialize(bytes: Uint8Array | pb_1.BinaryReader): Rost {
        const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes), message = new Rost();
        while (reader.nextField()) {
            if (reader.isEndGroup())
                break;
            switch (reader.getFieldNumber()) {
                case 2:
                    message.client = reader.readInt32();
                    break;
                case 3:
                    message.player = reader.readInt32();
                    break;
                case 4:
                    message.name = reader.readString();
                    break;
                default: reader.skipField();
            }
        }
        return message;
    }
    serializeBinary(): Uint8Array {
        return this.serialize();
    }
    static deserializeBinary(bytes: Uint8Array): Rost {
        return Rost.deserialize(bytes);
    }
}
export class GgMessage extends pb_1.Message {
    constructor(data?: any[] | {
        type?: GgType;
        client?: number;
        player?: number;
        name?: string;
        json?: string;
        inform?: string;
        roster?: Rost[];
        client_to?: number;
    }) {
        super();
        pb_1.Message.initialize(this, Array.isArray(data) ? data : [], 0, -1, [10], []);
        if (!Array.isArray(data) && typeof data == "object") {
            if ("type" in data && data.type != undefined) {
                this.type = data.type;
            }
            if ("client" in data && data.client != undefined) {
                this.client = data.client;
            }
            if ("player" in data && data.player != undefined) {
                this.player = data.player;
            }
            if ("name" in data && data.name != undefined) {
                this.name = data.name;
            }
            if ("json" in data && data.json != undefined) {
                this.json = data.json;
            }
            if ("inform" in data && data.inform != undefined) {
                this.inform = data.inform;
            }
            if ("roster" in data && data.roster != undefined) {
                this.roster = data.roster;
            }
            if ("client_to" in data && data.client_to != undefined) {
                this.client_to = data.client_to;
            }
        }
    }
    get type() {
        return pb_1.Message.getField(this, 1) as GgType;
    }
    set type(value: GgType) {
        pb_1.Message.setField(this, 1, value);
    }
    get client() {
        return pb_1.Message.getField(this, 2) as number;
    }
    set client(value: number) {
        pb_1.Message.setField(this, 2, value);
    }
    get player() {
        return pb_1.Message.getField(this, 3) as number;
    }
    set player(value: number) {
        pb_1.Message.setField(this, 3, value);
    }
    get name() {
        return pb_1.Message.getField(this, 4) as string;
    }
    set name(value: string) {
        pb_1.Message.setField(this, 4, value);
    }
    get json() {
        return pb_1.Message.getField(this, 5) as string;
    }
    set json(value: string) {
        pb_1.Message.setField(this, 5, value);
    }
    get inform() {
        return pb_1.Message.getField(this, 7) as string;
    }
    set inform(value: string) {
        pb_1.Message.setField(this, 7, value);
    }
    get roster() {
        return pb_1.Message.getRepeatedWrapperField(this, Rost, 10) as Rost[];
    }
    set roster(value: Rost[]) {
        pb_1.Message.setRepeatedWrapperField(this, 10, value);
    }
    get client_to() {
        return pb_1.Message.getField(this, 11) as number;
    }
    set client_to(value: number) {
        pb_1.Message.setField(this, 11, value);
    }
    static fromObject(data: {
        type?: GgType;
        client?: number;
        player?: number;
        name?: string;
        json?: string;
        inform?: string;
        roster?: ReturnType<typeof Rost.prototype.toObject>[];
        client_to?: number;
    }) {
        const message = new GgMessage({});
        if (data.type != null) {
            message.type = data.type;
        }
        if (data.client != null) {
            message.client = data.client;
        }
        if (data.player != null) {
            message.player = data.player;
        }
        if (data.name != null) {
            message.name = data.name;
        }
        if (data.json != null) {
            message.json = data.json;
        }
        if (data.inform != null) {
            message.inform = data.inform;
        }
        if (data.roster != null) {
            message.roster = data.roster.map(item => Rost.fromObject(item));
        }
        if (data.client_to != null) {
            message.client_to = data.client_to;
        }
        return message;
    }
    toObject() {
        const data: {
            type?: GgType;
            client?: number;
            player?: number;
            name?: string;
            json?: string;
            inform?: string;
            roster?: ReturnType<typeof Rost.prototype.toObject>[];
            client_to?: number;
        } = {};
        if (this.type != null) {
            data.type = this.type;
        }
        if (this.client != null) {
            data.client = this.client;
        }
        if (this.player != null) {
            data.player = this.player;
        }
        if (this.name != null) {
            data.name = this.name;
        }
        if (this.json != null) {
            data.json = this.json;
        }
        if (this.inform != null) {
            data.inform = this.inform;
        }
        if (this.roster != null) {
            data.roster = this.roster.map((item: Rost) => item.toObject());
        }
        if (this.client_to != null) {
            data.client_to = this.client_to;
        }
        return data;
    }
    serialize(): Uint8Array;
    serialize(w: pb_1.BinaryWriter): void;
    serialize(w?: pb_1.BinaryWriter): Uint8Array | void {
        const writer = w || new pb_1.BinaryWriter();
        if (this.type !== undefined)
            writer.writeEnum(1, this.type);
        if (this.client !== undefined)
            writer.writeInt32(2, this.client);
        if (this.player !== undefined)
            writer.writeInt32(3, this.player);
        if (typeof this.name === "string" && this.name.length)
            writer.writeString(4, this.name);
        if (typeof this.json === "string" && this.json.length)
            writer.writeString(5, this.json);
        if (typeof this.inform === "string" && this.inform.length)
            writer.writeString(7, this.inform);
        if (this.roster !== undefined)
            writer.writeRepeatedMessage(10, this.roster, (item: Rost) => item.serialize(writer));
        if (this.client_to !== undefined)
            writer.writeInt32(11, this.client_to);
        if (!w)
            return writer.getResultBuffer();
    }
    static deserialize(bytes: Uint8Array | pb_1.BinaryReader): GgMessage {
        const reader = bytes instanceof pb_1.BinaryReader ? bytes : new pb_1.BinaryReader(bytes), message = new GgMessage();
        while (reader.nextField()) {
            if (reader.isEndGroup())
                break;
            switch (reader.getFieldNumber()) {
                case 1:
                    message.type = reader.readEnum();
                    break;
                case 2:
                    message.client = reader.readInt32();
                    break;
                case 3:
                    message.player = reader.readInt32();
                    break;
                case 4:
                    message.name = reader.readString();
                    break;
                case 5:
                    message.json = reader.readString();
                    break;
                case 7:
                    message.inform = reader.readString();
                    break;
                case 10:
                    reader.readMessage(message.roster, () => pb_1.Message.addToRepeatedWrapperField(message, 10, Rost.deserialize(reader), Rost));
                    break;
                case 11:
                    message.client_to = reader.readInt32();
                    break;
                default: reader.skipField();
            }
        }
        return message;
    }
    serializeBinary(): Uint8Array {
        return this.serialize();
    }
    static deserializeBinary(bytes: Uint8Array): GgMessage {
        return GgMessage.deserialize(bytes);
    }
}
