import { WebClient } from '@slack/web-api';
import { logger } from '../utils/logger';

/**
 * Post a status message to a Slack thread.
 * Used by the dispatcher to report back after Kafka publish.
 */
export async function postStatusToSlack(
  botToken: string,
  channel: string,
  threadTs: string,
  message: string,
): Promise<void> {
  try {
    const client = new WebClient(botToken);
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: message,
      unfurl_links: false,
    });
    logger.info({ channel, threadTs }, 'Posted status to Slack');
  } catch (error) {
    // Best-effort: don't fail the dispatch if Slack notification fails
    logger.error({ error: String(error), channel, threadTs }, 'Failed to post status to Slack');
  }
}
