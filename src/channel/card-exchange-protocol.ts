export const CARD_EXCHANGE_PROTOCOL_ID = "https://channelelements.com/channel-protocols/card-exchange/v1";

export interface JsonPlusBinaryMessage<T> {
  json?: T;
  binary?: Uint8Array;
}

export interface CardExchangeMessageToSerialize extends JsonPlusBinaryMessage<CardExchangeMessagePayload> { }

export interface DeserializedCardExchangeMessage extends CardExchangeMessageToSerialize {
  valid: boolean;
  errorMessage?: string;
}

export interface CardExchangeMessagePayload {
  type: string; // 'add-card', 'card-to-card'
  details: AddCardMessageDetails | CardToCardMessageDetails;
}

export interface AddCardMessageDetails {
  cardId: string; // uniquely identifies one instance of a card
  package: string; // identifies the type of card:  suitable for bower install
  data: any;  // used to initialize the 'data' parameter of the component
}
// Control message payload may be followed by additional binary data that, if present, will be passed in "binary" parameter to component

export interface CardToCardMessageDetails {
  cardId: string;
  data: any;
}
// Control message payload may be followed by additional binary data that, if present, will be passed in "binary" argument to component "handleMessage" call

export interface ParticipantIdentity {
  name: string;
  imageUrl: string;
  address: Uint8Array;
}

export interface ParticipantInfo {
  details: ParticipantIdentity;
  memberSince: number;
  lastActive: number;
  isMe: boolean;
  isCreator: boolean;
}

export interface ChannelInfo extends EventTarget {  // 'participant-joined', 'participant-left'
  participants: ParticipantInfo[];
  sendCard(sender: ChannelWebComponent, data: JsonPlusBinaryMessage<any>, history: boolean, priority: boolean): Promise<void>;  // for component in 'compose' mode
  sendCardToCardMessage(sender: ChannelWebComponent, message: JsonPlusBinaryMessage<any>, history: boolean, priority: boolean): Promise<void>; // for component in 'view' mode
}

export interface ParticipantEvent { // 'participant-joined', 'participant-left'
  participant: ParticipantInfo;
}

export interface ChannelWebComponent extends HTMLElement {
  // parameters
  cardId: string;
  packageSource: string;
  mode: string;  // 'compose', 'view'
  channel: ChannelInfo; // component can add listeners

  // properties:  view-mode only
  data?: any;
  binary?: Uint8Array;

  // methods:  view-mode only
  handleCardToCardMessageReceived(sender: ParticipantInfo, details: CardToCardMessageDetails): void; // view mode only
}
// Component fires:  'resize' when it has unilaterally changed its own size (e.g., based on a message received)
