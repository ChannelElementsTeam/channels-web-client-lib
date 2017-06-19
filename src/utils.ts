import { RegistrationResponse, ChannelMessage, ControlChannelMessage, MessageToSerialize, DeserializedMessage } from './interfaces';
import { TextDecoder, TextEncoder } from 'text-encoding-utf-8';

export class Utils {
  static createAuth(registry: RegistrationResponse): string {
    const user = registry.id;
    const pswd = registry.token;
    return 'Basic ' + Utils.base64([user, pswd].join(':'));
  }

  static base64(input: string): string {
    return btoa(input);
  }
}

export class ChannelMessageUtils {
  static MESSAGE_HEADER_LENGTH = 32;
  static CHANNEL_ELEMENTS_VERSION_V1 = 0xCEB1;

  static serializeControlMessage(requestId: string, type: string, details: any, binaryPortion?: Uint8Array): Uint8Array {
    const controlMessage: ControlChannelMessage = {
      type: type,
      details: details
    };
    if (requestId) {
      controlMessage.requestId = requestId;
    }
    const messageInfo: MessageToSerialize = {
      channelCode: 0,
      senderCode: 0,
      history: false,
      priority: false,
      jsonMessage: controlMessage,
      binaryPayload: binaryPortion
    };
    return this.serializeChannelMessage(messageInfo, 0, 0);
  }

  static serializeChannelMessage(messageInfo: MessageToSerialize, lastTimestampSent: number, clockSkew: number): Uint8Array {
    // Allocate the proper length...
    let jsonPayloadBuffer: Uint8Array;
    let length = this.MESSAGE_HEADER_LENGTH;
    if (messageInfo.jsonMessage) {
      length += 4;
      if (messageInfo.jsonMessage) {
        jsonPayloadBuffer = new TextEncoder().encode(JSON.stringify(messageInfo.jsonMessage));
        length += jsonPayloadBuffer.byteLength;
      }
    }
    if (messageInfo.binaryPayload) {
      length += messageInfo.binaryPayload.byteLength;
    }
    const result = new Uint8Array(length);
    const view = new DataView(result.buffer);

    // Populate the header...

    let timestamp: number = Date.now() + clockSkew;
    if (timestamp <= lastTimestampSent) {
      timestamp = lastTimestampSent + 1;
    }
    view.setUint16(0, this.CHANNEL_ELEMENTS_VERSION_V1);
    const topTime = Math.floor(timestamp / (Math.pow(2, 32)));
    view.setUint16(2, topTime);
    const remainder = timestamp - (topTime * Math.pow(2, 32));
    view.setUint32(4, remainder);
    view.setUint32(8, messageInfo.channelCode ? messageInfo.channelCode : 0);
    view.setUint32(12, messageInfo.senderCode ? messageInfo.senderCode : 0);
    let behavior = 0;
    if (messageInfo.priority) {
      behavior |= 0x01;
    }
    if (messageInfo.history) {
      behavior |= 0x02;
    }
    view.setUint8(16, behavior);
    result.fill(0, 17, this.MESSAGE_HEADER_LENGTH);

    // Now the payload...

    let offset = this.MESSAGE_HEADER_LENGTH;
    if (jsonPayloadBuffer) {
      view.setUint32(offset, jsonPayloadBuffer.byteLength);
      offset += 4;
      result.set(jsonPayloadBuffer, offset);
      offset += jsonPayloadBuffer.byteLength;
    }
    if (messageInfo.binaryPayload) {
      result.set(messageInfo.binaryPayload, offset);
    }
    return result;
  }

  static parseChannelMessage(message: Uint8Array, enforceClockSync = true): DeserializedMessage {
    const result: DeserializedMessage = {
      valid: false,
      rawMessage: message
    };
    if (message.length < this.MESSAGE_HEADER_LENGTH) {
      result.errorMessage = 'Message is too short';
      return result;
    }
    const view = new DataView(message.buffer, message.byteOffset);
    if (view.getUint16(0) !== this.CHANNEL_ELEMENTS_VERSION_V1) {
      result.errorMessage = 'Message prefix is invalid.  Incorrect protocol?';
      return result;
    }
    const topBytes = view.getUint16(2);
    const bottomBytes = view.getUint32(4);
    const timestamp = topBytes * Math.pow(2, 32) + bottomBytes;
    const delta = Date.now() - timestamp;
    if (enforceClockSync && Math.abs(delta) > 15000) {
      result.valid = false;
      result.errorMessage = "Clocks are too far out of sync, or message timestamp is invalid";
      return result;
    }
    const behavior = view.getUint8(16);
    const contents: ChannelMessage = {
      serializedMessage: message,
      timestamp: timestamp,
      channelCode: view.getUint32(8),
      senderCode: view.getUint32(12),
      priority: (behavior & 0x01) ? true : false,
      history: (behavior & 0x02) ? true : false,
      fullPayload: new Uint8Array(message.buffer, message.byteOffset + this.MESSAGE_HEADER_LENGTH, message.byteLength - this.MESSAGE_HEADER_LENGTH)
    };
    result.contents = contents;
    result.valid = true;
    if (contents.channelCode === 0 && contents.senderCode === 0) {
      const jsonLength = view.getUint32(this.MESSAGE_HEADER_LENGTH);
      try {
        const jsonString = new TextDecoder("utf-8").decode(message.subarray(this.MESSAGE_HEADER_LENGTH + 4, this.MESSAGE_HEADER_LENGTH + 4 + jsonLength));
        contents.controlMessagePayload = {
          jsonMessage: JSON.parse(jsonString)
        };
        if (message.byteLength > this.MESSAGE_HEADER_LENGTH + 4 + jsonLength) {
          contents.controlMessagePayload.binaryPortion = new Uint8Array(contents.fullPayload.buffer, contents.fullPayload.byteOffset + 4 + jsonLength, contents.fullPayload.byteLength - 4 - jsonLength);
        }
      } catch (err) {
        result.valid = false;
        result.errorMessage = "Invalid control message payload";
      }
    }
    return result;
  }
}
