import { HistoryMessageDetails, ChannelMessage, MessageToSerialize, ChannelMessageUtils } from 'channels-common';

export type SocketConnectCallback = (err?: any) => void;
export type MessageCallback = (message: ChannelMessage, err?: Error) => void;
export type HistoryMessageCallback = (details: HistoryMessageDetails, message: ChannelMessage) => void;
export interface SocketConnectionListener {
  onSocketClosed(channels: string[]): void;
  onSocketConnected(channels: string[]): void;
}

enum SocketState {
  Connecting,
  Connected,
  Offline
}

interface SocketInfo {
  url: string;
  state: SocketState;
  connectedOnce: boolean;
  pendingCallbacks: SocketConnectCallback[];
  socket?: WebSocket;
  lastContact: number;
  pingInterval: number;
}

export class TransportManager {
  private polling = false;
  private counters: { [id: string]: number } = {};
  private sockets: { [url: string]: SocketInfo } = {};
  private socketsById: { [id: string]: SocketInfo } = {};
  private controlCallbacks: { [id: string]: MessageCallback } = {};
  historyMessageHandler: HistoryMessageCallback;
  channelMessageHandler: MessageCallback;
  controlMessageHandler: MessageCallback;
  channelSocketListener: SocketConnectionListener;

  connect(url: string, channelId?: string): Promise<void> {
    this.ensureSocketPolling();
    return new Promise<void>((resolve, reject) => {
      let info = this.sockets[url];
      if (info) {
        if (channelId) {
          this.socketsById[channelId] = info;
        }
        switch (info.state) {
          case SocketState.Connected:
            resolve();
            return;
          case SocketState.Connecting:
            info.pendingCallbacks.push((err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            });
            return;
          default:
            break;
        }
      }
      if (!info) {
        info = {
          url: url,
          connectedOnce: false,
          state: SocketState.Connecting,
          pendingCallbacks: [],
          lastContact: 0,
          pingInterval: 0
        };
        this.sockets[url] = info;
        if (channelId) {
          this.socketsById[channelId] = info;
        }
      } else {
        info.state = SocketState.Connecting;
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
    info.lastContact = 0;
    info.pingInterval = 0;
    info.state = SocketState.Connecting;
    try {
      const socket = new WebSocket(info.url);
      socket.binaryType = "arraybuffer";
      info.socket = socket;
      socket.onopen = (event) => {
        if (socket.readyState === WebSocket.OPEN) {
          info.state = SocketState.Connected;
          try {
            for (const cb of info.pendingCallbacks) {
              cb();
            }
          } catch (err) {
            // noop
          }
          if (info.connectedOnce && this.channelSocketListener) {
            const channels: string[] = [];
            for (const ch in this.socketsById) {
              if (this.socketsById.hasOwnProperty(ch)) {
                const si = this.socketsById[ch];
                if (si.url === info.url) {
                  channels.push(ch);
                }
              }
            }
            try {
              this.channelSocketListener.onSocketConnected(channels);
            } catch (_) { /*noop*/ }
          }
          info.connectedOnce = true;
          console.log("Socket connectd to ", info.url);
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
          info.state = SocketState.Offline;
          info.pendingCallbacks = [];
        }
        console.error("Socket error: ", error);
      };
      socket.onclose = (event) => {
        info.state = SocketState.Offline;
        console.error("Socket closed: ", event);
        if (info.connectedOnce && this.channelSocketListener) {
          const channels: string[] = [];
          for (const ch in this.socketsById) {
            if (this.socketsById.hasOwnProperty(ch)) {
              const si = this.socketsById[ch];
              if (si.url === info.url) {
                channels.push(ch);
              }
            }
          }
          try {
            this.channelSocketListener.onSocketClosed(channels);
          } catch (_) { /*noop*/ }
        }
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
        info.state = SocketState.Offline;
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
    info.lastContact = (new Date()).getTime();

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
            info.pingInterval = controlMessage.details.interval || 0;
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
    if (info && info.state === SocketState.Connected) {
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
    if (info && info.state === SocketState.Connected) {
      const bytes = ChannelMessageUtils.serializeChannelMessage(message, 0, 0);
      info.socket.send(bytes.buffer);
    } else {
      throw new Error("Socket not connected to this channel");
    }
  }

  private ensureSocketPolling() {
    if (!this.polling) {
      this.polling = true;
      this.socketPoll();
    }
  }

  private socketPoll() {
    setTimeout(() => {
      try {
        for (const url in this.sockets) {
          if (this.sockets.hasOwnProperty(url)) {
            const info = this.sockets[url];
            if (info.connectedOnce) {
              switch (info.state) {
                case SocketState.Offline:
                  try {
                    this.reconnectSocket(info);
                  } catch (_) {
                    // noop
                  }
                  break;
                case SocketState.Connected:
                  if (info.pingInterval > 0) {
                    const now = (new Date()).getTime();
                    if ((now - info.lastContact) > (2 * info.pingInterval)) {
                      console.warn("Socket with " + url + " has not been contacted for 2 * pingInterval. Disconnecting and will try to reconnect.");
                      info.socket.close();
                    }
                  }
                  break;
                default:
                  break;
              }
            }
          }
        }
      } finally {
        this.socketPoll();
      }
    }, 6000);
  }

  private reconnectSocket(info: SocketInfo) {
    console.log("Reconnecting socket: " + info.url);
    this.connect(info.url);
  }
}
