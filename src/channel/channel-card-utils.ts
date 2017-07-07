import { CardExchangeMessagePayload, JsonPlusBinaryMessage, AddCardMessageDetails, CardToCardMessageDetails } from './card-exchange-protocol';
import { MessageToSerialize } from 'channels-common';

export class CardUtils {
  static addCardMessage(channelCode: number, senderCode: number, packageName: string, jsonPlusBinary: JsonPlusBinaryMessage<any>, history = true, priority = false): MessageToSerialize {
    const addCardDetails: AddCardMessageDetails = {
      cardId: CardUtils.guid(),
      package: packageName,
      data: jsonPlusBinary.json || {}
    };
    const cardExchangePayload: CardExchangeMessagePayload = {
      type: 'add-card',
      details: addCardDetails
    };
    const message: MessageToSerialize = {
      channelCode: channelCode,
      senderCode: senderCode,
      priority: priority,
      history: history,
      jsonMessage: cardExchangePayload
    };
    if (jsonPlusBinary.binary) {
      message.binaryPayload = jsonPlusBinary.binary;
    }
    return message;
  }

  static cardToCardMessage(channelCode: number, senderCode: number, cardId: string, jsonPlusBinary: JsonPlusBinaryMessage<any>, history = true, priority = false): MessageToSerialize {
    const cardToCardDetails: CardToCardMessageDetails = {
      cardId: cardId,
      data: jsonPlusBinary.json || {}
    };
    const cardExchangePayload: CardExchangeMessagePayload = {
      type: 'card-to-card',
      details: cardToCardDetails
    };
    const message: MessageToSerialize = {
      channelCode: channelCode,
      senderCode: senderCode,
      priority: priority,
      history: history,
      jsonMessage: cardExchangePayload
    };
    if (jsonPlusBinary.binary) {
      message.binaryPayload = jsonPlusBinary.binary;
    }
    return message;
  }

  static guid() {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint8Array(8);
      window.crypto.getRandomValues(buf);
      const func = (num: number) => {
        let ret = num.toString(16);
        while (ret.length < 4) {
          ret = "0" + ret;
        }
        return ret;
      };
      return (func(buf[0]) + func(buf[1]) + "-" + func(buf[2]) + "-" + func(buf[3]) + "-" + func(buf[4]) + "-" + func(buf[5]) + func(buf[6]) + func(buf[7]));
    } else {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }
}
