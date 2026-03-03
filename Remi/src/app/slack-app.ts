import { App, LogLevel } from '@slack/bolt';
import { ConversationManager } from '../core/conversation-manager';
import { globalErrorHandler } from './middleware';
import { logger } from '../utils/logger';

export interface SlackAppOptions {
  botToken: string;
  signingSecret: string;
  appToken: string;
  conversationManager: ConversationManager;
}

export function createSlackApp(options: SlackAppOptions): App {
  const app = new App({
    token: options.botToken,
    signingSecret: options.signingSecret,
    appToken: options.appToken,
    socketMode: true,
    logLevel: LogLevel.WARN,
  });

  app.error(globalErrorHandler as any);

  const conversationManager = options.conversationManager;

  // Handle @Remi mentions
  app.event('app_mention', async ({ event, context }) => {
    const channel = event.channel;
    const ts = event.ts;
    const text = event.text ?? '';
    const user = event.user ?? '';
    const threadTs = (event as any).thread_ts ?? ts;
    const botUserId = context.botUserId ?? '';

    logger.info(
      { channel, threadTs, user, textLength: text.length },
      'Received @mention',
    );

    await conversationManager.handleMention(channel, threadTs, user, botUserId, text);
  });

  // Handle thread replies (for input/approval responses)
  app.event('message', async ({ event }) => {
    // Only handle thread replies
    const msg = event as any;
    if (!msg.thread_ts || msg.subtype) return; // Ignore non-threaded messages and system messages

    const { channel, thread_ts, user, text } = msg;

    // Skip bot's own messages
    if (msg.bot_id) return;

    logger.debug(
      { channel, threadTs: thread_ts, user },
      'Received thread reply',
    );

    await conversationManager.handleThreadReply(channel, thread_ts, user, text);
  });

  return app;
}
