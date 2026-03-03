import { WebClient } from '@slack/web-api';
import { logger } from '../utils/logger';
import type { ISlackMessenger } from '../core/types';

export class SlackMessenger implements ISlackMessenger {
  constructor(private readonly client: WebClient) {}

  async postStatus(channel: string, threadTs: string, message: string): Promise<void> {
    await this.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: message,
      unfurl_links: false,
    });
  }

  async postError(channel: string, threadTs: string, error: Error): Promise<void> {
    const message = `:x: *Error*: ${error.message}\n\nIf this keeps happening, please contact the team.`;
    await this.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: message,
      unfurl_links: false,
    });
    logger.error({ channel, threadTs, error: error.message, stack: error.stack }, 'Posted error to Slack');
  }

  async askQuestion(
    channel: string,
    threadTs: string,
    question: string,
    options?: string[],
  ): Promise<void> {
    let text = `:question: ${question}`;
    if (options?.length) {
      text += '\n' + options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
      text += '\n\nReply with the number of your choice.';
    }

    await this.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      unfurl_links: false,
    });
  }

  async postApprovalRequest(
    channel: string,
    threadTs: string,
    summary: string,
  ): Promise<void> {
    const text = [
      summary,
      '',
      ':white_check_mark: Reply *APPROVE* to schedule deployment',
      ':no_entry_sign: Reply *CANCEL* to abort',
    ].join('\n');

    await this.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text,
      unfurl_links: false,
    });
  }

  async postCompletion(channel: string, threadTs: string, summary: string): Promise<void> {
    await this.client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `:tada: ${summary}`,
      unfurl_links: false,
    });
  }
}
