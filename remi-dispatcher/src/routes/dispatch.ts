import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { validatePayload } from '../middleware/validate';
import { publishToKafka } from '../services/kafka-producer';
import { postStatusToSlack } from '../services/slack-notifier';
import { logger } from '../utils/logger';
import type { DispatchPayload } from '../types/dispatch-payload';

const router = Router();

// In-memory idempotency set (cleared on restart — Cloud Tasks handles persistence)
const processedRequests = new Set<string>();

router.post(
  '/dispatch',
  authMiddleware,
  validatePayload,
  async (req: Request, res: Response) => {
    const payload = req.body as DispatchPayload;
    const requestLogger = logger.child({ requestId: payload.request_id });

    // Idempotency check
    if (processedRequests.has(payload.request_id)) {
      requestLogger.warn('Duplicate request_id — already processed');
      res.status(200).json({
        status: 'already_processed',
        request_id: payload.request_id,
      });
      return;
    }

    try {
      requestLogger.info(
        {
          topic: payload.deployment.kafka_topic,
          templateId: payload.deployment.template_id,
          table: payload.dataset_ref.table,
        },
        'Processing dispatch request',
      );

      // Publish to Kafka (pointer-based: consumer reads BQ table)
      const kafkaMessage = {
        request_id: payload.request_id,
        dataset_ref: payload.dataset_ref,
        template_id: payload.deployment.template_id,
        variant: payload.deployment.variant,
        scheduled_for: payload.scheduled_for,
        audit: payload.audit,
      };

      await publishToKafka(
        payload.deployment.kafka_topic,
        payload.request_id, // Message key for idempotency
        kafkaMessage,
      );

      // Mark as processed
      processedRequests.add(payload.request_id);

      // Best-effort: post status to Slack thread
      const slackToken = process.env.SLACK_BOT_TOKEN || '';
      if (slackToken) {
        const statusMessage = [
          `:white_check_mark: *Deployment published to Kafka*`,
          '',
          `*Request ID*: \`${payload.request_id}\``,
          `*Topic*: \`${payload.deployment.kafka_topic}\``,
          `*Template*: \`${payload.deployment.template_id}\``,
          `*Audience table*: \`${payload.dataset_ref.project}.${payload.dataset_ref.dataset}.${payload.dataset_ref.table}\``,
          '',
          `Downstream consumer will process the campaign.`,
        ].join('\n');

        await postStatusToSlack(
          slackToken,
          payload.slack_callback.channel,
          payload.slack_callback.thread_ts,
          statusMessage,
        );
      }

      requestLogger.info('Dispatch completed successfully');

      res.status(200).json({
        status: 'dispatched',
        request_id: payload.request_id,
      });
    } catch (error) {
      requestLogger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Dispatch failed',
      );

      // Post error to Slack (best-effort)
      const slackToken = process.env.SLACK_BOT_TOKEN || '';
      if (slackToken) {
        await postStatusToSlack(
          slackToken,
          payload.slack_callback.channel,
          payload.slack_callback.thread_ts,
          `:x: *Deployment failed*\nRequest ID: \`${payload.request_id}\`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

      res.status(500).json({
        status: 'error',
        request_id: payload.request_id,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  },
);

export { router as dispatchRouter };
