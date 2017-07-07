import { ChannelsClient } from './client';
import { ChannelIdentityUtils } from 'channels-common';
import { ChannelController } from './channel/channel-controller';

(window as any).ChannelsClient = ChannelsClient;
(window as any).ChannelIdentityUtils = ChannelIdentityUtils;
(window as any).ChannelController = ChannelController;
