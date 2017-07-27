import { ChannelsClient } from './client';
import { ChannelIdentityUtils } from 'channels-common';
import { ChannelController } from './channel/channel-controller';

const anyWindow = window as any;
anyWindow.ChannelsClient = ChannelsClient;
anyWindow.ChannelIdentityUtils = ChannelIdentityUtils;
anyWindow.ChannelController = ChannelController;
if (!anyWindow.TextDecoder) {
  console.log("TextDecoder not present. Setting pollyfil");
  anyWindow.TextDecoder = TextDecoder;
} else {
  console.log("TextDecoder detected.");
}
