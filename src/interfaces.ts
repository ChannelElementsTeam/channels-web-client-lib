export interface ChannelServerResponse {
  protocolVersion: string;  // e.g., "1.0.0":  conforms to which version of the specification
  provider: {
    name: string;
    logo: string;
    homepage: string;
    details: any;
  };
  implementation: {
    name: string;
    logo: string;
    homepage: string;
    version: string;
    details: any;
  };
  services: ProviderServiceList;
  implementationDetails: any; // for implementor to provide additional information
}

export interface RegistrationRequest {
  identity: any;
}

// Response from registration
export interface RegistrationResponse {
  id: string;
  token: string;
  services: ProviderServiceList;
}

export interface AccountResponse {
  id: string;
  services: ProviderServiceList;
  identity: any;
}

export interface ProviderServiceList {
  providerUrl: string;
  serviceHomeUrl: string;
  registrationUrl: string;
  accountUrl: string;
  createChannelUrl: string;
  channelListUrl: string;
  shareChannelUrl: string;
  acceptChannelUrl: string;
}

export interface AccountUpdateRequest {
  identity: any;
}

export interface ShareRequest {
  channelId: string;
  details: any;
}

export interface ShareResponse {
  shareCodeUrl: string;
}

export interface ShareCodeResponse {
  providerUrl: string;
  registrationUrl: string;
  acceptChannelUrl: string;
  invitationId: string;
  details: any;
}

export interface ChannelJoinRequest {
  invitationId: string;
  details: any;
}

export interface ChannelCreateRequest {
  options?: ChannelOptions;
  channelDetails?: any;
  participantDetails?: any;
}

export interface ChannelMemberInfo {
  participantId: string;
  details: any;
  isCreator: boolean;
  memberSince: number;
  lastActive: number;
}

export interface GetChannelResponse {
  channelId: string;
  transportUrl: string;
  registerUrl: string;
  channelUrl: string;
  options: ChannelOptions;
  details: any;
  isCreator: boolean;
  memberCount: number;
  recentlyActiveMembers: ChannelMemberInfo[];
  created: number;
  lastUpdated: number;
}

export interface ChannelDeleteResponseDetails {
  channelId: string;
}

export interface ChannelListResponse {
  total: number;
  channels: GetChannelResponse[];
}

export interface ChannelParticipantInfo {
  participantId: string;
  code: number;
  details: any;
  isCreator: boolean;
  isYou: boolean;
  memberSince: number;
  lastActive: number;
}

export interface ControlChannelMessage {
  requestId?: string;
  type: string; // see https://github.com/ChannelElementsTeam/channel-server/wiki/Control-Channel-Messages
  details: any; // depends on type
}

export interface JoinRequestDetails {
  channelId: string;
}

export interface JoinResponseDetails {
  channelId: string;
  channelCode: number;
  participantId: string;
  participantCode: number;
  participants: ChannelParticipantInfo[];
}

export interface LeaveRequestDetails {
  channelId: string;
  permanently?: boolean;
}

export interface HistoryRequestDetails {
  channelId: string;
  before: number;
  after?: number;
  maxCount: number;
}

export interface HistoryResponseDetails {
  count: number;
  total: number;
}

export interface HistoryMessageDetails {
  timestamp: number;
  channelId: string;
  participantId: string;
}

export interface PingRequestDetails {
  interval?: number;
}

export interface ErrorDetails {
  statusCode: number;
  errorMessage: string;
  channelId?: string;
}

export interface RateLimitDetails {
  channelId: string;
  options: string[];
}

export interface JoinNotificationDetails {
  channelId: string;
  participantId: string;
  participantCode: number;
  participantDetails: any;
}

export interface LeaveNotificationDetails {
  channelId: string;
  participantId: string;
  participantCode: number;
  permanently: boolean;
}

export interface ChannelDeletedNotificationDetails {
  channelId: string;
}

export interface ControlMessagePayload {
  jsonMessage: ControlChannelMessage;
  binaryPortion?: Uint8Array;
}

export interface ChannelOptions {
  history?: boolean;
  maxHistoryCount?: number;
  maxHistorySeconds?: number;
  priority?: boolean;
  maxParticipants?: number;
  maxPayloadSize?: number;
  maxMessageRate?: number;
  maxDataRate?: number;
  topology?: string; // many-to-many, one-to-many, many-to-one
}

export interface MessageToSerialize {
  channelCode: number;
  senderCode: number;
  priority: boolean;
  history: boolean;
  jsonMessage?: any;
  binaryPayload?: Uint8Array;
}

export interface ChannelMessage {
  serializedMessage: Uint8Array;
  timestamp: number;
  channelCode: number;
  senderCode: number;
  priority: boolean;
  history: boolean;
  fullPayload?: Uint8Array;
  controlMessagePayload?: {
    jsonMessage: any;
    binaryPortion?: Uint8Array;
  };
}

export interface DeserializedMessage {
  valid: boolean;
  errorMessage?: string;
  rawMessage?: Uint8Array;
  contents?: ChannelMessage;
}
