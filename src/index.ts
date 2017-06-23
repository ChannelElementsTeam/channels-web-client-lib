import { Rest } from './rest';
import { ClientDb } from './db';
import { Utils } from './utils';
import { TransportManager, MessageCallback, HistoryMessageCallback } from './transport';
import {
  RegistrationResponse, ChannelServerResponse, ChannelCreateRequest, GetChannelResponse, ChannelDeletedNotificationDetails,
  JoinResponseDetails, ChannelMessage, JoinNotificationDetails, LeaveNotificationDetails, ShareRequest, ShareResponse, ShareCodeResponse,
  ChannelJoinRequest, ChannelListResponse, MessageToSerialize, ChannelDeleteResponseDetails, HistoryResponseDetails, LeaveRequestDetails,
  HistoryRequestDetails, JoinRequestDetails
} from './interfaces';

export * from './interfaces';

export type ParticipantListener = (joined: JoinNotificationDetails, left: LeaveNotificationDetails) => void;
export type ChannelDeletedListener = (details: ChannelDeletedNotificationDetails) => void;

class ChannelsClient {
  private db: ClientDb;
  private transport: TransportManager;
  private joinedChannels: { [channelId: string]: JoinResponseDetails } = {};
  private joinedChannelsByCode: { [channelCode: string]: JoinResponseDetails } = {};
  private historyCallbacks: { [channelId: string]: HistoryMessageCallback[] } = {};
  private channelMessageCallbacks: { [channelId: string]: MessageCallback[] } = {};
  private channelParticipantListeners: { [channelId: string]: ParticipantListener[] } = {};
  private channelDeletedListeners: ChannelDeletedListener[] = [];

  constructor() {
    this.db = new ClientDb();
    this.transport = new TransportManager();

    this.transport.historyMessageHandler = (details, message) => {
      const joinInfo = this.joinedChannelsByCode[message.channelCode];
      if (joinInfo) {
        const cbList = this.historyCallbacks[joinInfo.channelId];
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
          const cbList = this.channelMessageCallbacks[joinInfo.channelId];
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
        const cbList = this.channelParticipantListeners[joinNotification.channelId];
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
        const cbList = this.channelParticipantListeners[leaveNotification.channelId];
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

  async register(serverUrl: string, identity: any): Promise<RegistrationResponse> {
    await this.ensureDb();
    const cached = await this.db.getRegistry(null, serverUrl);
    if (cached) {
      return cached;
    }
    const serverInfo = await Rest.get<ChannelServerResponse>(serverUrl);
    if (serverInfo && serverInfo.services.registrationUrl) {
      const response = await this.getRegistry(serverInfo.services.registrationUrl, identity);
      return response;
    } else {
      throw new Error("Failed to fetch channel server info.");
    }
  }

  private async getRegistry(registryUrl: string, identity: any): Promise<RegistrationResponse> {
    await this.ensureDb();
    const cached = await this.db.getRegistry(registryUrl);
    if (cached) {
      return cached;
    }
    const response = await Rest.post<RegistrationResponse>(registryUrl, {
      identity: identity || {}
    });
    if (response) {
      await this.db.saveRegistry(response);
      return response;
    } else {
      throw new Error("Failed to register with server at " + registryUrl);
    }
  }

  async createChannel(registryUrl: string, request: ChannelCreateRequest = {}): Promise<GetChannelResponse> {
    await this.ensureDb();
    const registry = await this.db.getRegistry(registryUrl);
    if (!registry) {
      throw new Error("Failed to create channel: Provider is not registered");
    }
    const headers = { Authorization: Utils.createAuth(registry) };
    return await Rest.post<GetChannelResponse>(registry.services.createChannelUrl, request, headers);
  }

  async shareChannel(registerUrl: string, request: ShareRequest): Promise<ShareResponse> {
    await this.ensureDb();
    const registry = await this.db.getRegistry(registerUrl);
    if (!registry) {
      throw new Error("Failed to create channel: Provider is not registered");
    }
    const headers = { Authorization: Utils.createAuth(registry) };
    return await Rest.post<ShareResponse>(registry.services.shareChannelUrl, request, headers);
  }

  async getInviteInfo(inviteCode: string): Promise<ShareCodeResponse> {
    const headers = { "Content-Type": "application/json" };
    return await Rest.get<ShareCodeResponse>(inviteCode, headers);
  }

  async acceptInvitation(inviteCode: string, identity: any, participantDetails: any): Promise<GetChannelResponse> {
    const shareCodeResponse = await this.getInviteInfo(inviteCode);
    if (!shareCodeResponse) {
      throw new Error("Invalid share code");
    }
    const registry = await this.register(shareCodeResponse.providerUrl, identity);
    const request: ChannelJoinRequest = {
      invitationId: shareCodeResponse.invitationId,
      details: participantDetails
    };
    const headers = { Authorization: Utils.createAuth(registry) };
    return await Rest.post<GetChannelResponse>(shareCodeResponse.acceptChannelUrl, request, headers);
  }

  async getChannelsWithProvider(url: string): Promise<GetChannelResponse[]> {
    await this.ensureDb();
    const result: GetChannelResponse[] = [];
    let registry = await this.db.getRegistry(url);
    if (!registry) {
      registry = await this.db.getRegistry(null, url);
    }
    if (registry) {
      const listResponse = await this.getChannelsFromRegistry(registry);
      if (listResponse && listResponse.channels) {
        for (const cs of listResponse.channels) {
          result.push(cs);
        }
      }
    }
    return result;
  }

  async listAllChannels(): Promise<GetChannelResponse[]> {
    await this.ensureDb();
    const registries = await this.db.getAllRegistries();
    const result: GetChannelResponse[] = [];
    for (const registry of registries) {
      const listResponse = await this.getChannelsFromRegistry(registry);
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

  private async getChannelsFromRegistry(registry: RegistrationResponse): Promise<ChannelListResponse> {
    const headers = { Authorization: Utils.createAuth(registry) };
    return await Rest.get<ChannelListResponse>(registry.services.channelListUrl, headers);
  }

  async getChannel(registryUrl: string, channelUrl: string): Promise<GetChannelResponse> {
    await this.ensureDb();
    const registry = await this.db.getRegistry(registryUrl);
    if (!registry) {
      throw new Error("Failed to fetch channel: Provider is not registered");
    }
    const headers = { Authorization: Utils.createAuth(registry) };
    return await Rest.get<GetChannelResponse>(channelUrl, headers);
  }

  async deleteChannel(registryUrl: string, channelDeleteUrl: string): Promise<ChannelDeleteResponseDetails> {
    await this.ensureDb();
    const registry = await this.db.getRegistry(registryUrl);
    if (!registry) {
      throw new Error("Failed to delete channel: Provider is not registered");
    }
    const headers = { Authorization: Utils.createAuth(registry) };
    return await Rest.delete<ChannelDeleteResponseDetails>(channelDeleteUrl, headers);
  }

  async connectTransport(registryUrl: string, channelId: string, url: string): Promise<void> {
    await this.ensureDb();
    const registry = await this.db.getRegistry(registryUrl);
    if (!registry) {
      throw new Error("Failed to connect: Provider is not registered");
    }
    const fullUrl = new URL(url);
    let query = fullUrl.search || "";
    if (!query) {
      query = "?";
    } else if (query.length > 1) {
      query = query + "&";
    }
    query += "id=" + encodeURIComponent(registry.id);
    query += "&token=" + encodeURIComponent(registry.token);
    fullUrl.search = query;
    await this.transport.connect(channelId, fullUrl.toString());
  }

  async joinChannel(request: JoinRequestDetails): Promise<JoinResponseDetails> {
    return new Promise<JoinResponseDetails>((resolve, reject) => {
      this.transport.sendControlMessageByChannel(request.channelId, 'join', request, (message, err) => {
        if (err) {
          reject(err);
        } else {
          const controlMessage = message.controlMessagePayload.jsonMessage;
          const joinResponse = controlMessage.details as JoinResponseDetails;
          this.joinedChannels[request.channelId] = joinResponse;
          this.joinedChannelsByCode[joinResponse.channelCode] = joinResponse;
          resolve(joinResponse);
        }
      });
    });
  }

  async leaveChannel(request: LeaveRequestDetails): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.transport.sendControlMessageByChannel(request.channelId, 'leave', request, (message, err) => {
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
      const channelId = request.channelId;
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
