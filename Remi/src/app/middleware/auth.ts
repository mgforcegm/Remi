import type { Middleware, SlackEventMiddlewareArgs } from '@slack/bolt';
import { defaultConfig } from '../../../config/default';
import { logger } from '../../utils/logger';

export const authMiddleware: Middleware<SlackEventMiddlewareArgs> = async ({ event, next }) => {
  if (!defaultConfig.rbac.enforceRbac) {
    await next();
    return;
  }

  const channel = (event as any).channel as string | undefined;
  const user = (event as any).user as string | undefined;

  if (channel && defaultConfig.rbac.allowedChannels.length > 0) {
    if (!defaultConfig.rbac.allowedChannels.includes(channel)) {
      logger.warn({ channel, user }, 'Rejected: channel not in allowed list');
      return; // Silently ignore unauthorized channels
    }
  }

  if (user && defaultConfig.rbac.allowedUsers.length > 0) {
    if (!defaultConfig.rbac.allowedUsers.includes(user)) {
      logger.warn({ channel, user }, 'Rejected: user not in allowed list');
      return;
    }
  }

  await next();
};
