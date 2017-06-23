import { HistoryMessageDetails, ChannelMessage, MessageToSerialize } from "./interfaces";
import { ChannelMessageUtils } from './utils';

export type SocketConnectCallback = (err?: any) => void;
export type MessageCallback = (message: ChannelMessage, err?: Error) => void;
export type HistoryMessageCallback = (details: HistoryMessageDetails, message: ChannelMessage) => void;

interface SocketInfo {
  url: string;
  connected: boolean;
  connecting: boolean;
  pendingCallbacks: SocketConnectCallback[];
  socket?: WebSocket;
}

export class TransportManager {
  private counters: { [id: string]: number } = {};
  private sockets: { [url: string]: SocketInfo } = {};
  private socketsById: { [id: string]: SocketInfo } = {};
  private controlCallbacks: { [id: string]: MessageCallback } = {};
  historyMessageHandler: HistoryMessageCallback;
  channelMessageHandler: MessageCallback;
  controlMessageHandler: MessageCallback;

  connect(channelId: string, url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let info = this.sockets[url];
      if (info) {
        this.socketsById[channelId] = info;
        if (info.connected) {
          resolve();
          return;
        }
        if (info.connecting) {
          info.pendingCallbacks.push((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
          return;
        }
      }
      if (!info) {
        info = {
          url: url,
          connected: false,
          connecting: true,
          pendingCallbacks: []
        };
        this.sockets[url] = info;
        this.socketsById[channelId] = info;
      } else {
        info.connecting = true;
        info.pendingCallbacks = [];
      }
      info.pendingCallbacks.push((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
      this.connectSocket(info);
    });
  }

  private connectSocket(info: SocketInfo) {
    info.connecting = true;
    try {
      const socket = new WebSocket(info.url);
      socket.binaryType = "arraybuffer";
      info.socket = socket;
      socket.onopen = (event) => {
        if (socket.readyState === WebSocket.OPEN) {
          info.connecting = false;
          info.connected = true;
          try {
            for (const cb of info.pendingCallbacks) {
              cb();
            }
          } catch (err) {
            // noop
          }
        }
      };
      socket.onerror = (error) => {
        try {
          for (const cb of info.pendingCallbacks) {
            cb(error);
          }
        } catch (err) {
          // noop
        } finally {
          info.connected = false;
          info.connecting = false;
          info.pendingCallbacks = [];
        }
        console.error("Socket error: ", error);
      };
      socket.onclose = (event) => {
        info.connected = false;
        info.connecting = false;
        console.error("Socket closed: ", event);
      };
      socket.onmessage = (event) => {
        this.onMessageReceived(info, event);
      };

    } catch (err) {
      try {
        for (const cb of info.pendingCallbacks) {
          cb(err);
        }
      } catch (err) {
        // noop
      } finally {
        info.connected = false;
        info.connecting = false;
        info.pendingCallbacks = [];
      }
    }
  }

  private onMessageReceived(info: SocketInfo, event: MessageEvent) {
    const data = event.data;
    if (data) {
      const buffer = event.data as ArrayBuffer;
      const parsed = ChannelMessageUtils.parseChannelMessage(new Uint8Array(buffer));
      if (parsed && parsed.valid && parsed.contents) {
        this.handleMessage(info, parsed.contents);
      } else {
        console.warn("Failed to parse message: ", parsed ? parsed.errorMessage : "null");
      }
      return;
    }
  }

  private handleMessage(info: SocketInfo, message: ChannelMessage) {
    // handle control message
    if (message.channelCode === 0 && message.controlMessagePayload) {
      const controlMessage = message.controlMessagePayload.jsonMessage;
      let handled = false;
      if (controlMessage.requestId) {
        // the client wants to handle the  message
        if (this.controlCallbacks[controlMessage.requestId]) {
          const cb = this.controlCallbacks[controlMessage.requestId];
          try {
            cb(message);
          } catch (err) { /*noop*/ } finally {
            handled = true;
            delete this.controlCallbacks[controlMessage.requestId];
          }
        }
      }
      if (!handled) {
        // This library will try to handle the message or fire the appropriate events
        switch (controlMessage.type) {
          case 'ping':
            this.sendControlMessage(info.url, 'ping-reply', {}, controlMessage.requestId);
            break;
          case 'history-message': {
            if (this.historyMessageHandler) {
              const binaryMessage = message.controlMessagePayload.binaryPortion;
              const parsedMessage = ChannelMessageUtils.parseChannelMessage(binaryMessage, false);
              if (parsedMessage && parsedMessage.valid) {
                const historyMessageInfo = parsedMessage.contents;
                try {
                  this.historyMessageHandler((message.controlMessagePayload.jsonMessage.details as HistoryMessageDetails), historyMessageInfo);
                } catch (ex) { /* noop */ }
              } else {
                console.warn("Ignoring history message: Failed to parse.", parsedMessage ? parsedMessage.errorMessage : "");
              }
            }
            break;
          }
          default:
            if (this.controlMessageHandler) {
              try {
                this.controlMessageHandler(message);
              } catch (ex) { /* noop */ }
            }
            break;
        }
      }
    } else {
      // Not a control message
      if (this.channelMessageHandler) {
        try {
          this.channelMessageHandler(message);
        } catch (ex) { /* noop */ }
      } else {
        console.log("Channel message received", message);
      }
    }
  }

  sendControlMessage(transportUrl: string, type: string, details: any, messageId?: string, callback?: MessageCallback) {
    const info = this.sockets[transportUrl];
    this.sendControl(messageId || this.createId("general"), info, type, details, callback);
  }

  sendControlMessageByChannel(channelId: string, type: string, details: any, callback?: MessageCallback) {
    const info = this.socketsById[channelId];
    this.sendControl(this.createId(channelId), info, type, details, callback);
  }

  private createId(root: string): string {
    if (!this.counters[root]) {
      this.counters[root] = 0;
    }
    this.counters[root]++;
    return root + "-" + this.counters[root];
  }

  private sendControl(messageId: string, info: SocketInfo, type: string, details: any, callback?: MessageCallback) {
    if (info && info.connected) {
      if (callback) {
        this.controlCallbacks[messageId] = callback;
      }
      const bytes = ChannelMessageUtils.serializeControlMessage(messageId, type, details);
      info.socket.send(bytes.buffer);
    } else if (callback) {
      callback(null, new Error("Socket not connected to this destination"));
    }
  }

  send(channelId: string, message: MessageToSerialize) {
    const info = this.socketsById[channelId];
    if (info && info.connected) {
      const bytes = ChannelMessageUtils.serializeChannelMessage(message, 0, 0);
      info.socket.send(bytes.buffer);
    } else {
      throw new Error("Socket not connected to this channel");
    }
  }
}
