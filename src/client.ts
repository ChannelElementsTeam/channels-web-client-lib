import { Rest } from './rest';
import { ClientDb, SwitchInfo } from './db';
import { TransportManager, MessageCallback, HistoryMessageCallback, SocketConnectionListener } from './transport';
import {
  ChannelDeletedNotificationDetails, ChannelCreateDetails, ChannelCreateResponse, SignedKeyIdentity, ChannelInformation,
  SignedAddressIdentity, ChannelShareDetails, ChannelShareResponse, ChannelShareCodeResponse, MemberContractDetails, ChannelDeleteResponse,
  JoinResponseDetails, ChannelMessage, JoinNotificationDetails, LeaveNotificationDetails, ChannelAcceptResponse, ChannelAcceptDetails, ChannelDeleteDetails,
  MessageToSerialize, HistoryResponseDetails, LeaveRequestDetails, ChannelsListDetails, ChannelsListResponse, ChannelGetResponse, ChannelGetDetails, MemberIdentityInfo,
  HistoryRequestDetails, JoinRequestDetails, SwitchingServiceRequest, SwitchServiceDescription, SwitchRegisterUserDetails, SwitchRegisterUserResponse
} from 'channels-common';

export * from 'channels-common';

export type ParticipantListener = (joined: JoinNotificationDetails, left: LeaveNotificationDetails) => void;
export type ChannelDeletedListener = (details: ChannelDeletedNotificationDetails) => void;
export type ChannelSocketListener = (connected: boolean) => void;

export interface ProviderChannelInformation extends ChannelInformation {
  providerId: any;
}

export interface AccptInvitationResponse {
  shareCode: ChannelShareCodeResponse;
  channel: ChannelAcceptResponse;
  provider: SwitchInfo;
}

const SWITCH_PROTOCOL_VERSION = 1;

export class ChannelsClient implements SocketConnectionListener {
  private db: ClientDb;
  private transport: TransportManager;
  private joinedChannels: { [channelAddress: string]: JoinResponseDetails } = {};
  private joinedChannelsByCode: { [code: string]: JoinResponseDetails } = {};
  private historyCallbacks: { [channelAddress: string]: HistoryMessageCallback[] } = {};
  private channelMessageCallbacks: { [channelAddress: string]: MessageCallback[] } = {};
  private channelParticipantListeners: { [channelAddress: string]: ParticipantListener[] } = {};
  private channelDeletedListeners: ChannelDeletedListener[] = [];
  private channelSocketListeners: { [channelAddress: string]: ChannelSocketListener[] } = {};
  private switchByUrl: { [url: string]: SwitchServiceDescription } = {};

  constructor() {
    this.db = new ClientDb();
    this.transport = new TransportManager();

    this.transport.historyMessageHandler = (details, message) => {
      const cbList = this.historyCallbacks[details.channelAddress];
      if (cbList) {
        for (const cb of cbList) {
          try {
            cb(details, message);
          } catch (er) { /* noop */ }
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

    this.transport.channelSocketListener = this;
  }

  onSocketClosed(channels: string[]): void {
    if (channels && channels.length) {
      for (const ch of channels) {
        const list = this.channelSocketListeners[ch];
        if (list) {
          for (const cb of list) {
            try {
              cb(false);
            } catch (_) { /*noop*/ }
          }
        }
      }
    }
  }

  onSocketConnected(channels: string[]): void {
    if (channels && channels.length) {
      for (const ch of channels) {
        const list = this.channelSocketListeners[ch];
        if (list) {
          for (const cb of list) {
            try {
              cb(true);
            } catch (_) { /*noop*/ }
          }
        }
      }
    }
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
      case 'socket':
        if (!this.channelSocketListeners[channelId]) {
          this.channelSocketListeners[channelId] = [];
        }
        this.channelSocketListeners[channelId].push(listener);
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
      case 'socket': {
        const list = this.channelSocketListeners[channelId];
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
            this.channelSocketListeners[channelId] = list;
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

  async getProvider(serverUrl: string): Promise<SwitchServiceDescription> {
    const cached = this.switchByUrl[serverUrl];
    if (cached) {
      return cached;
    }
    const providerInfo = await Rest.get<SwitchServiceDescription>(serverUrl);
    if (providerInfo && providerInfo.serviceEndpoints) {
      this.switchByUrl[serverUrl] = providerInfo;
      return providerInfo;
    }
    console.error("Failed to fetch provider info - invalid response", providerInfo);
    throw new Error("Failed to fetch provider info - invalid response");
  }

  async getProviderById(id: number): Promise<SwitchServiceDescription> {
    await this.ensureDb();
    const info = await this.db.getProviderById(id);
    if (info) {
      return await this.getProvider(info.url);
    } else {
      return null;
    }
  }

  async getSwitchInfo(url: string): Promise<SwitchInfo> {
    await this.ensureDb();
    return await this.db.getProviderByUrl(url);
  }

  async registerWithSwitch(providerUrl: string, identity: SignedKeyIdentity, details: SwitchRegisterUserDetails, force: boolean = false): Promise<void> {
    let saved = null;
    if (!force) {
      // check if already registered
      await this.ensureDb();
      saved = await this.db.getProviderByUrl(providerUrl);
      if (saved) {
        return;
      }
    }

    const provider = await this.getProvider(providerUrl);
    const request: SwitchingServiceRequest<SignedKeyIdentity, SwitchRegisterUserDetails> = {
      version: SWITCH_PROTOCOL_VERSION,
      type: 'register-user',
      identity: identity,
      details: details
    };
    const response = await Rest.post<SwitchRegisterUserResponse>(provider.serviceEndpoints.restServiceUrl, request);
    if (response) {
      await this.ensureDb();
      saved = await this.db.getProviderByUrl(providerUrl);
      if (!saved) {
        await this.db.saveProvider(providerUrl);
      }
    }
    // return response;
    return;
  }

  async createChannel(providerUrl: string, identity: SignedAddressIdentity, details: ChannelCreateDetails): Promise<ChannelCreateResponse> {
    const provider = await this.getProvider(providerUrl);
    const request: SwitchingServiceRequest<SignedAddressIdentity, ChannelCreateDetails> = {
      version: SWITCH_PROTOCOL_VERSION,
      type: 'create',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelCreateResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async shareChannel(providerId: number, identity: SignedAddressIdentity, details: ChannelShareDetails): Promise<ChannelShareResponse> {
    const provider = await this.getProviderById(providerId);
    if (!provider) {
      throw new Error("No provider registered with id: " + providerId);
    }
    const shareRequest: SwitchingServiceRequest<SignedAddressIdentity, ChannelShareDetails> = {
      version: SWITCH_PROTOCOL_VERSION,
      type: 'share',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelShareResponse>(provider.serviceEndpoints.restServiceUrl, shareRequest);
  }

  async getInviteInfo(inviteCode: string): Promise<ChannelShareCodeResponse> {
    const headers = { "Accept": "application/json" };
    return await Rest.get<ChannelShareCodeResponse>(inviteCode, headers);
  }

  async acceptInvitation(inviteInfo: ChannelShareCodeResponse, identity: SignedAddressIdentity, identityInfo: MemberIdentityInfo, memberContract?: MemberContractDetails): Promise<AccptInvitationResponse> {
    const providerUrl = inviteInfo.serviceEndpoints.descriptionUrl;
    const provider = await this.getProvider(providerUrl);
    await this.ensureDb();
    const switchInfo = await this.db.getProviderByUrl(providerUrl);
    if (!switchInfo) {
      throw new Error("Provider not registered");
    }

    const mc = memberContract || { subscribe: false };
    const details: ChannelAcceptDetails = {
      invitationId: inviteInfo.invitationId,
      memberContract: mc,
      memberIdentity: identityInfo
    };
    const request: SwitchingServiceRequest<SignedAddressIdentity, ChannelAcceptDetails> = {
      version: SWITCH_PROTOCOL_VERSION,
      identity: identity,
      type: 'accept',
      details: details
    };
    const channelInfo = await Rest.post<ChannelAcceptResponse>(provider.serviceEndpoints.restServiceUrl, request);
    return {
      channel: channelInfo,
      shareCode: inviteInfo,
      provider: switchInfo
    };
  }

  async getChannelsWithProvider(providerId: number, identity: SignedAddressIdentity): Promise<ProviderChannelInformation[]> {
    const result: ProviderChannelInformation[] = [];
    const provider = await this.getProviderById(providerId);
    if (!provider) {
      return result;
    }
    const listResponse = await this.getChannelsFromProvider(provider, identity);
    if (listResponse && listResponse.channels) {
      for (const cs of listResponse.channels) {
        const pci = (cs as ProviderChannelInformation);
        pci.providerId = providerId;
        result.push(pci);
      }
    }
    return result;
  }

  async listAllChannels(identity: SignedAddressIdentity): Promise<ProviderChannelInformation[]> {
    await this.ensureDb();
    const switches = await this.db.getAllProviders();
    const result: ProviderChannelInformation[] = [];
    for (const switchInfo of switches) {
      const provider = await this.getProviderById(switchInfo.id);
      const listResponse = await this.getChannelsFromProvider(provider, identity);
      if (listResponse && listResponse.channels) {
        for (const cs of listResponse.channels) {
          const pci = (cs as ProviderChannelInformation);
          pci.providerId = switchInfo.id;
          result.push(pci);
        }
      }
    }
    result.sort((a, b) => {
      return b.created - a.created;
    });
    return result;
  }

  private async getChannelsFromProvider(provider: SwitchServiceDescription, identity: SignedAddressIdentity): Promise<ChannelsListResponse> {
    const request: SwitchingServiceRequest<SignedAddressIdentity, ChannelsListDetails> = {
      version: SWITCH_PROTOCOL_VERSION,
      type: 'list',
      identity: identity,
      details: {}
    };
    return await Rest.post<ChannelsListResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async getChannel(providerId: number, identity: SignedAddressIdentity, channelAddress: string): Promise<ChannelGetResponse> {
    const provider = await this.getProviderById(providerId);
    const details: ChannelGetDetails = {
      channel: channelAddress
    };
    const request: SwitchingServiceRequest<SignedAddressIdentity, ChannelGetDetails> = {
      version: SWITCH_PROTOCOL_VERSION,
      type: 'get',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelGetResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async deleteChannel(providerId: number, identity: SignedAddressIdentity, channelAddress: string): Promise<ChannelDeleteResponse> {
    const provider = await this.getProviderById(providerId);
    const details: ChannelDeleteDetails = {
      channel: channelAddress
    };
    const request: SwitchingServiceRequest<SignedAddressIdentity, ChannelDeleteDetails> = {
      version: SWITCH_PROTOCOL_VERSION,
      type: 'delete',
      identity: identity,
      details: details
    };
    return await Rest.post<ChannelDeleteResponse>(provider.serviceEndpoints.restServiceUrl, request);
  }

  async connectTransport(providerId: number, channelAddress: string, transportUrl: string): Promise<void> {
    const provider = await this.getProviderById(providerId);
    if (!provider) {
      throw new Error("No provider registered with id: " + providerId);
    }
    await this.transport.connect(transportUrl, channelAddress);
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

  static encode(data: any): Uint8Array {
    const text = (typeof data === "string") ? data : JSON.stringify(data);
    const payload = new TextEncoder().encode(text);
    return payload;
  }

  static decode(binary: Uint8Array, json?: boolean): string {
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
