import type { Middleware, SlackEventMiddlewareArgs } from '@slack/bolt';
import { logger } from '../../utils/logger';

export const loggingMiddleware: Middleware<SlackEventMiddlewareArgs> = async ({ event, next }) => {
  const eventType = (event as any).type ?? 'unknown';
  const user = (event as any).user ?? 'unknown';
  const channel = (event as any).channel ?? 'unknown';

  logger.info({ eventType, user, channel }, 'Incoming Slack event');

  await next();
};
