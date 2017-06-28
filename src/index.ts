import { Rest } from './rest';
import { ClientDb } from './db';
import { TransportManager, MessageCallback, HistoryMessageCallback } from './transport';
import {
  ChannelDeletedNotificationDetails, ChannelServiceDescription, ChannelCreateDetails, ChannelCreateResponse, SignedKeyIdentity, ChannelInformation,
  ChannelServiceRequest, SignedAddressIdentity, ChannelShareDetails, ChannelShareResponse, ChannelShareCodeResponse, MemberContractDetails, ChannelDeleteResponse,
  JoinResponseDetails, ChannelMessage, JoinNotificationDetails, LeaveNotificationDetails, ChannelAcceptResponse, ChannelAcceptDetails, ChannelDeleteDetails,
  MessageToSerialize, HistoryResponseDetails, LeaveRequestDetails, ChannelsListDetails, ChannelsListResponse, ChannelGetResponse, ChannelGetDetails,
  HistoryRequestDetails, JoinRequestDetails
} from 'channels-common';

export * from 'channels-common';

export type ParticipantListener = (joined: JoinNotificationDetails, left: LeaveNotificationDetails) => void;
export type ChannelDeletedListener = (details: ChannelDeletedNotificationDetails) => void;

class ChannelsClient {
  private db: ClientDb;
  private transport: TransportManager;
  private joinedChannels: { [channelAddress: string]: JoinResponseDetails } = {};
  private joinedChannelsByCode: { [code: string]: JoinResponseDetails } = {};
  private historyCallbacks: { [channelAddress: string]: HistoryMessageCallback[] } = {};
  private channelMessageCallbacks: { [channelAddress: string]: MessageCallback[] } = {};
  private channelParticipantListeners: { [channelAddress: string]: ParticipantListener[] } = {};
  private channelDeletedListeners: ChannelDeletedListener[] = [];

  constructor() {
    this.db = new ClientDb();
    this.transport = new TransportManager();

    this.transport.historyMessageHandler = (details, message) => {
      const joinInfo = this.joinedChannelsByCode[message.channelCode];
      if (joinInfo) {
        const cbList = this.historyCallbacks[joinInfo.channelAddress];
        if (cbList) {
          for (const cb of cbList) {
            try {
              cb(details, message);
            } catch (er) { /* noop */ }
          }
        }
      }
    };

    this.transport.channelMessageHandler = (message, err) => {
      if (!err) {
        const joinInfo = this.joinedChannelsByCode[message.channelCode];
        if (joinInfo) {
          const cbList = this.channelMessageCallbacks[joinInfo.channelAddress];
          if (cbList) {
            for (const cb of cbList) {
              try {
                cb(message);
              } catch (er) { /* noop */ }
            }
          }
        }
      }
    };

    this.transport.controlMessageHandler = (message, err) => {
      if (!err) {
        this.handleControlMessage(message);
      }
    };
  }

  private handleControlMessage(message: ChannelMessage) {
    const controlMessage = message.controlMessagePayload.jsonMessage;
    switch (controlMessage.type) {
      case 'join-notification': {
        const joinNotification = controlMessage.details as JoinNotificationDetails;
        const cbList = this.channelParticipantListeners[joinNotification.channelAddress];
        if (cbList) {
          for (const cb of cbList) {
            try {
              cb(joinNotification, null);
            } catch (er) { /* noop */ }
          }
        }
        break;
      }
      case 'leave-notification': {
        const leaveNotification = controlMessage.details as LeaveNotificationDetails;
        const cbList = this.channelParticipantListeners[leaveNotification.channelAddress];
        if (cbList) {
          for (const cb of cbList) {
            try {
              cb(null, leaveNotification);
            } catch (er) { /* noop */ }
          }
        }
        break;
      }
      case 'channel-deleted': {
        const notification = controlMessage.details as ChannelDeletedNotificationDetails;
        if (notification) {
          for (const l of this.channelDeletedListeners) {
            try {
              l(notification);
            } catch (er) { /* noop */ }
          }
        }
        break;
      }
      default: break;
    }
  }

  addChannelListener(name: string, channelId: string, listener: any): void {
    switch (name) {
      case 'delete':
        this.channelDeletedListeners.push(listener);
        break;
      case 'participant':
        if (!this.channelParticipantListeners[channelId]) {
          this.channelParticipantListeners[channelId] = [];
        }
        this.channelParticipantListeners[channelId].push(listener);
        break;
      case 'message':
        if (!this.channelMessageCallbacks[channelId]) {
          this.channelMessageCallbacks[channelId] = [];
        }
        this.channelMessageCallbacks[channelId].push(listener);
        break;
      case 'history-message':
        if (!this.historyCallbacks[channelId]) {
          this.historyCallbacks[channelId] = [];
        }
        this.historyCallbacks[channelId].push(listener);
        break;
      default:
        break;
    }
  }

  removeChannelListener(name: string, channelId: string, listener: any) {
    switch (name) {
      case 'delete': {
        let index = -1;
        for (let i = 0; i < this.channelDeletedListeners.length; i++) {
          if (listener === this.channelDeletedListeners[i]) {
            index = i;
            break;
          }
        }
        if (index >= 0) {
          this.channelDeletedListeners.splice(index, 1);
        }
        break;
      }
      case 'participant': {
        const list = this.channelParticipantListeners[channelId];
        if (list) {
          let index = -1;
          for (let i = 0; i < list.length; i++) {
            if (listener === list[i]) {
              index = i;
              break;
            }
          }
          if (index >= 0) {
            list.splice(index, 1);
            this.channelParticipantListeners[channelId] = list;
          }
        }
        break;
      }
      case 'message': {
        const list = this.channelMessageCallbacks[channelId];
        if (list) {
          let index = -1;
          for (let i = 0; i < list.length; i++) {
            if (listener === list[i]) {
              index = i;
              break;
            }
          }
          if (index >= 0) {
            list.splice(index, 1);
            this.channelMessageCallbacks[channelId] = list;
          }
        }
        break;
      }
      case 'history-message': {
        const list = this.historyCallbacks[channelId];
        if (list) {
          let index = -1;
          for (let i = 0; i < list.length; i++) {
            if (listener === list[i]) {
              index = i;
              break;
            }
          }
          if (index >= 0) {
            list.splice(index, 1);
            this.historyCallbacks[channelId] = list;
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private async ensureDb(): Promise<void> {
    await this.db.open();
  }

  async getProvider(serverUrl: string): Promise<ChannelServiceDescription> {
    await this.ensureDb();
    const cached = await this.db.getProvider(serverUrl);
    if (cached) {
      return cached;
    }
    const providerInfo = await Rest.get<ChannelServiceDescription>(serverUrl);
    if (providerInfo && providerInfo.serviceEndpoints) {
      await this.db.saveProvider(serverUrl, providerInfo);
      return providerInfo;
    }
    console.error("Failed to fetch provider info - invalid response", providerInfo);
    throw new Error("Failed to fetch provider info - invalid response");
  }

  async createChannel(providerUrl: string, identity: SignedKeyIdentity, details: ChannelCreateDetails): Promise<ChannelCreateResponse> {
    const provider = await this.getProvider(providerUrl);
    const request: ChannelServiceRequest<SignedKeyIdentity, ChannelCreateDetails> = {
      type: 'create',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelCreateResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async shareChannel(providerUrl: string, identity: SignedAddressIdentity, details: ChannelShareDetails): Promise<ChannelShareResponse> {
    const provider = await this.getProvider(providerUrl);
    const shareRequest: ChannelServiceRequest<SignedAddressIdentity, ChannelShareDetails> = {
      type: 'share',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelShareResponse>(provider.serviceEndpoints.restServiceUrl, shareRequest);
  }

  async getInviteInfo(inviteCode: string): Promise<ChannelShareCodeResponse> {
    const headers = { "Content-Type": "application/json" };
    return await Rest.get<ChannelShareCodeResponse>(inviteCode, headers);
  }

  async acceptInvitation(inviteCode: string, identity: SignedKeyIdentity, memberContract?: MemberContractDetails): Promise<ChannelAcceptResponse> {
    const inviteInfo = await this.getInviteInfo(inviteCode);
    const provider = await this.getProvider(inviteInfo.serviceEndpoints.descriptionUrl);
    const mc = memberContract || { subscribe: false };
    const details: ChannelAcceptDetails = {
      invitationId: inviteInfo.invitationId,
      memberContract: mc
    };
    const request: ChannelServiceRequest<SignedKeyIdentity, ChannelAcceptDetails> = {
      identity: identity,
      type: 'accept',
      details: details
    };
    return await Rest.post<ChannelAcceptResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async getChannelsWithProvider(providerUrl: string, identity: SignedAddressIdentity): Promise<ChannelInformation[]> {
    const provider = await this.getProvider(providerUrl);
    const listResponse = await this.getChannelsFromProvider(provider, identity);
    const result: ChannelInformation[] = [];
    if (listResponse && listResponse.channels) {
      for (const cs of listResponse.channels) {
        result.push(cs);
      }
    }
    return result;
  }

  async listAllChannels(identity: SignedAddressIdentity): Promise<ChannelInformation[]> {
    const providers = await this.db.getAllProviders();
    const result: ChannelInformation[] = [];
    for (const provider of providers) {
      const listResponse = await this.getChannelsFromProvider(provider, identity);
      if (listResponse && listResponse.channels) {
        for (const cs of listResponse.channels) {
          result.push(cs);
        }
      }
    }
    result.sort((a, b) => {
      return b.created - a.created;
    });
    return result;
  }

  private async getChannelsFromProvider(provider: ChannelServiceDescription, identity: SignedAddressIdentity): Promise<ChannelsListResponse> {
    const request: ChannelServiceRequest<SignedAddressIdentity, ChannelsListDetails> = {
      type: 'list',
      identity: identity,
      details: {}
    };
    return await Rest.post<ChannelsListResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async getChannel(providerUrl: string, identity: SignedAddressIdentity, channelAddress: string): Promise<ChannelGetResponse> {
    const provider = await this.getProvider(providerUrl);
    const details: ChannelGetDetails = {
      channel: channelAddress
    };
    const request: ChannelServiceRequest<SignedAddressIdentity, ChannelGetDetails> = {
      type: 'get',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelGetResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async deleteChannel(providerUrl: string, identity: SignedAddressIdentity, channelAddress: string): Promise<ChannelDeleteResponse> {
    const provider = await this.getProvider(providerUrl);
    const details: ChannelDeleteDetails = {
      channel: channelAddress
    };
    const request: ChannelServiceRequest<SignedAddressIdentity, ChannelDeleteDetails> = {
      type: 'delete',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelDeleteResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async connectTransport(providerUrl: string, channelAddress: string, transportUrl: string): Promise<void> {
    await this.getProvider(providerUrl);
    await this.transport.connect(channelAddress, transportUrl);
  }

  joinChannel(request: JoinRequestDetails): Promise<JoinResponseDetails> {
    return new Promise<JoinResponseDetails>((resolve, reject) => {
      this.transport.sendControlMessageByChannel(request.channelAddress, "join", request, (message, err) => {
        if (err) {
          reject(err);
        } else {
          const controlMessage = message.controlMessagePayload.jsonMessage;
          const joinResponse = controlMessage.details as JoinResponseDetails;
          this.joinedChannels[request.channelAddress] = joinResponse;
          this.joinedChannelsByCode[joinResponse.channelCode] = joinResponse;
          resolve(joinResponse);
        }
      });
    });
  }

  async leaveChannel(request: LeaveRequestDetails): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.transport.sendControlMessageByChannel(request.channelAddress, 'leave', request, (message, err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async getHistory(request: HistoryRequestDetails): Promise<HistoryResponseDetails> {
    return new Promise<HistoryResponseDetails>((resolve, reject) => {
      const channelId = request.channelAddress;
      const joinInfo = this.joinedChannels[channelId];
      if (!joinInfo) {
        reject(new Error("Trying to fetch history of an unjoined channel"));
        return;
      }
      this.transport.sendControlMessageByChannel(channelId, 'history', request, (message, err) => {
        if (err) {
          reject(err);
        } else {
          const controlMessage = message.controlMessagePayload.jsonMessage;
          const historyResponse = controlMessage.details as HistoryResponseDetails;
          resolve(historyResponse);
        }
      });
    });
  };

  encode(data: any): Uint8Array {
    const text = (typeof data === "string") ? data : JSON.stringify(data);
    const payload = new TextEncoder().encode(text);
    return payload;
  }

  decode(binary: Uint8Array, json?: boolean): string {
    return new TextDecoder('utf-8').decode(binary);
  }

  async sendMessage(channelId: string, message: MessageToSerialize): Promise<MessageToSerialize> {
    return new Promise<MessageToSerialize>((resolve, reject) => {
      try {
        this.transport.send(channelId, message);
        resolve(message);
      } catch (err) {
        reject(err);
      }
    });
  }
}

(window as any).ChannelsClient = ChannelsClient;
