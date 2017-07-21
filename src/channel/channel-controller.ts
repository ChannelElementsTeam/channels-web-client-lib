import { ChannelsClient, ParticipantListener, ChannelSocketListener, ChannelDeletedListener } from '../client';
import {
  ChannelInformation, JoinResponseDetails, HistoryMessageDetails, ChannelMessage, JoinNotificationDetails, LeaveNotificationDetails,
  ChannelIdentityUtils, SignedKeyIdentity, MemberIdentityInfo, ChannelDeletedNotificationDetails
} from "channels-common";
import { HistoryMessageCallback, MessageCallback } from '../transport';
import { DeserializedCardExchangeMessage, ChannelWebComponent, JsonPlusBinaryMessage } from './card-exchange-protocol';
import { CardUtils } from './channel-card-utils';

// ParticipantInfo is a dummy/temporary interface to consolidate various participant data structures
interface ParticipantInfo {
  identity: SignedKeyIdentity;
  code?: number;
  details?: MemberIdentityInfo;
  isCreator?: boolean;
  memberSince?: number;
  lastActive?: number;
  isYou?: boolean;
}

export class ChannelController {
  private client: ChannelsClient;
  private node: HTMLElement;
  private channelInfo: ChannelInformation;
  private joinData: JoinResponseDetails;
  private attached = false;
  private participantByAddress: { [address: string]: ParticipantInfo } = {};
  private participantByCode: { [code: number]: ParticipantInfo } = {};

  // listeners
  private historyListener: HistoryMessageCallback;
  private messageListener: MessageCallback;
  private participantListener: ParticipantListener;
  private deleteListener: ChannelDeletedListener;
  private socketListener: ChannelSocketListener;

  constructor(client: ChannelsClient, node?: HTMLElement) {
    this.client = client;
    this.node = node || null;
  }

  attach() {
    this.attached = true;
    this.onData();
    this.attachListeners();
  }

  detach() {
    this.attached = false;
    this.removeListeners();
  }

  private removeListeners(): void {
    if (!this.channelInfo) {
      return;
    }
    if (this.historyListener) {
      this.client.removeChannelListener('history-message', this.channelInfo.channelAddress, this.historyListener);
      this.historyListener = null;
    }
    if (this.messageListener) {
      this.client.removeChannelListener('message', this.channelInfo.channelAddress, this.messageListener);
      this.messageListener = null;
    }
    if (this.participantListener) {
      this.client.removeChannelListener('participant', this.channelInfo.channelAddress, this.participantListener);
      this.participantListener = null;
    }
    if (this.deleteListener) {
      this.client.removeChannelListener('delete', this.channelInfo.channelAddress, this.deleteListener);
      this.deleteListener = null;
    }
    if (this.socketListener) {
      this.client.removeChannelListener('socket', this.channelInfo.channelAddress, this.socketListener);
      this.socketListener = null;
    }
  }

  private attachListeners(): void {
    if (!this.channelInfo) {
      return;
    }

    this.removeListeners();

    this.historyListener = (details, message) => {
      if (this.attached) {
        this.handleHistoryMessage(details, message);
      }
    };
    this.messageListener = (message) => {
      if (this.attached) {
        this.handleMessage(message);
      }
    };
    this.participantListener = (joined, left) => {
      if (this.attached) {
        this.handleParticipant(joined, left);
      }
    };
    this.deleteListener = (notification) => {
      if (this.attached) {
        this.handleChannelDelete(notification);
      }
    };
    this.socketListener = (connected) => {
      if (this.attached) {
        this.handleSocketConnected(connected);
      }
    };

    this.client.addChannelListener("history-message", this.channelInfo.channelAddress, this.historyListener);
    this.client.addChannelListener("message", this.channelInfo.channelAddress, this.messageListener);
    this.client.addChannelListener("participant", this.channelInfo.channelAddress, this.participantListener);
    this.client.addChannelListener("delete", this.channelInfo.channelAddress, this.deleteListener);
    this.client.addChannelListener("socket", this.channelInfo.channelAddress, this.socketListener);
  }

  private handleHistoryMessage(details: HistoryMessageDetails, message: ChannelMessage): void {
    if (this.node) {
      const channelMessage = this.parseChannelMessage(message.fullPayload);
      if (!channelMessage.valid) {
        console.warn("Ignoring history message: ", channelMessage.errorMessage, message);
        return;
      }
      const participantInfo = this.participantByAddress[details.senderAddress];
      const event = new CustomEvent('history-message', {
        bubbles: true, detail: {
          message: message,
          channelMessage: channelMessage,
          participant: participantInfo
        }
      });
      this.node.dispatchEvent(event);
    }
  }

  private handleMessage(message: ChannelMessage): void {
    if (this.node) {
      const channelMessage = this.parseChannelMessage(message.fullPayload);
      if (!channelMessage.valid) {
        console.warn("Ignoring channel message: ", channelMessage.errorMessage, message);
        return;
      }
      const participantInfo = this.participantByCode[message.senderCode];
      const event = new CustomEvent('message', {
        bubbles: true, detail: {
          message: message,
          channelMessage: channelMessage,
          participant: participantInfo
        }
      });
      this.node.dispatchEvent(event);
    }
  }

  private handleParticipant(joined: JoinNotificationDetails, left: LeaveNotificationDetails): void {
    if (joined) {
      const participantInfo: ParticipantInfo = {
        identity: joined.signedIdentity,
        code: joined.participantCode,
      };
      participantInfo.details = joined.memberIdentity;
      const decoded = ChannelIdentityUtils.decodeSignedKeySignature(joined.signedIdentity.signature, joined.signedIdentity.publicKey, 0);
      this.participantByCode[joined.participantCode] = participantInfo;
      if (!this.participantByAddress[decoded.address]) {
        this.participantByAddress[decoded.address] = participantInfo;
      }
      console.log("Participant joined", participantInfo);
      if (this.node) {
        const event = new CustomEvent('participant-joined', { bubbles: true, detail: { participant: participantInfo } });
        this.node.dispatchEvent(event);
      }
    } else {
      const data = this.participantByAddress[left.participantAddress] || this.participantByCode[left.participantCode];
      if (this.participantByCode[left.participantCode]) {
        delete this.participantByCode[left.participantCode];
      }
      if (left.permanently) {
        delete this.participantByAddress[left.participantAddress];
      }
      console.log("Participant left", data);
      if (this.node) {
        const event = new CustomEvent('participant-left', { bubbles: true, detail: { participant: data, permanently: left.permanently } });
        this.node.dispatchEvent(event);
      }
    }
  }

  private handleChannelDelete(details: ChannelDeletedNotificationDetails): void {
    if (this.channelInfo) {
      const chid = details.channelAddress;
      if (chid === this.channelInfo.channelAddress) {
        if (this.node) {
          const event = new CustomEvent('delete', { bubbles: true, detail: details });
          this.node.dispatchEvent(event);
        }
      }
    }
    const event = new CustomEvent('refresh-channels', { bubbles: true, detail: {} });
    window.dispatchEvent(event);
  }

  private parseChannelMessage(payload: Uint8Array): DeserializedCardExchangeMessage {
    const exchangeMessage: DeserializedCardExchangeMessage = { valid: false };
    const view = new DataView(payload.buffer, payload.byteOffset);
    const jsonLength = view.getUint32(0);
    try {
      const jsonString = new TextDecoder("utf-8").decode(payload.subarray(4, 4 + jsonLength));
      exchangeMessage.json = JSON.parse(jsonString);
      if (payload.byteLength > (4 + jsonLength)) {
        exchangeMessage.binary = new Uint8Array(payload.buffer, payload.byteOffset + 4 + jsonLength, payload.byteLength - 4 - jsonLength);
      }
      exchangeMessage.valid = true;
    } catch (err) {
      exchangeMessage.valid = false;
      exchangeMessage.errorMessage = err.message || "Invalid payload";
    }
    return exchangeMessage;
  }

  private handleSocketConnected(connected: boolean): void {
    if (this.node) {
      const event = new CustomEvent('socket', {
        bubbles: true, detail: { connected: connected }
      });
      this.node.dispatchEvent(event);
    }
  }

  private onData() {
    this.participantByAddress = {};
    this.participantByCode = {};
    if (this.channelInfo && this.joinData) {
      for (const m of this.channelInfo.members) {
        const memberIdentity = m.memberIdentity;
        const p: ParticipantInfo = {
          identity: m.identity,
          isCreator: m.isCreator,
          lastActive: m.lastActive,
          memberSince: m.memberSince,
          details: memberIdentity
        };
        const decoded = ChannelIdentityUtils.decodeAddressSignature(m.identity.signature, m.identity.publicKey, 0);
        this.participantByAddress[decoded.address] = p;
      }
      for (const m of this.joinData.participants) {
        const memberIdentity = m.participantIdentity.memberIdentity;
        const p: ParticipantInfo = {
          code: m.code,
          identity: m.participantIdentity.signedIdentity,
          isCreator: m.isCreator,
          lastActive: m.lastActive,
          memberSince: m.memberSince,
          details: memberIdentity,
          isYou: m.isYou
        };
        this.participantByCode[p.code] = p;
      }
    }
  }

  // ChannelInfo interface methods

  get participants(): ParticipantInfo[] {
    const list: ParticipantInfo[] = [];
    for (const key in this.participantByAddress) {
      if (this.participantByAddress.hasOwnProperty(key)) {
        list.push(this.participantByAddress[key]);
      }
    }
    return list;
  }

  get me() {
    for (const key in this.participantByCode) {
      if (this.participantByCode.hasOwnProperty(key)) {
        const p = this.participantByCode[key];
        if (p.isYou) {
          return p;
        }
      }
    }
  }

  sendCard(sender: ChannelWebComponent, messageData: JsonPlusBinaryMessage<any>, history = true, priority = false) {
    return new Promise((resolve, reject) => {
      if (!this.joinData) {
        console.warn("Ignoring new card message. Channel not joined.");
        reject(new Error("Ignoring new card message. Channel not joined."));
      } else {
        const message = CardUtils.addCardMessage(this.joinData.channelCode, this.joinData.participantCode, sender.packageSource, messageData, history, priority);
        this.client.sendMessage(this.channelInfo.channelAddress, message).then((sentMessage) => {
          resolve(sentMessage);
          if (this.node) {
            const event = new CustomEvent('message', {
              bubbles: true, detail: {
                message: message,
                channelMessage: {
                  valid: true,
                  json: message.jsonMessage,
                  binary: message.binaryPayload
                },
                participant: this.me
              }
            });
            this.node.dispatchEvent(event);
          }
        }).catch((err) => {
          console.error("Failed to send message: ", err);
          reject(err);
        });
      }
    });
  }

  sendCardToCardMessage(sender: ChannelWebComponent, messageData: JsonPlusBinaryMessage<any>, history = true, priority = false) {
    return new Promise((resolve, reject) => {
      if (!this.joinData) {
        console.warn("Ignoring card message. Channel not joined.");
        reject(new Error("Ignoring card message. Channel not joined."));
      } else {
        const message = CardUtils.cardToCardMessage(this.joinData.channelCode, this.joinData.participantCode, sender.cardId, messageData, history, priority);
        this.client.sendMessage(this.channelInfo.channelAddress, message).then((sentMessage) => {
          resolve(sentMessage);
        }).catch((err) => {
          console.error("Failed to send message: ", err);
          reject(err);
        });
      }
    });
  }
}
