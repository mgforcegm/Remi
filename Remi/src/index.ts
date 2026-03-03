import 'dotenv/config';

import { WebClient } from '@slack/web-api';
import { GoogleAuth } from 'google-auth-library';
import { createSlackApp } from './app/slack-app';
import { WorkflowEngine } from './core/workflow-engine';
import { WorkflowRegistry } from './core/workflow-registry';
import { ConversationManager } from './core/conversation-manager';
import { SlackMessenger } from './services/slack-messenger';
import { GoogleSheetsService } from './services/google-sheets';
import { BigQueryService } from './services/bigquery';
import { CloudTasksService } from './services/cloud-tasks';
import { SmsCampaignWorkflow } from './workflows/sms-campaign';
import { servicesConfig } from '../config/services';
import { defaultConfig } from '../config/default';
import { logger } from './utils/logger';

async function main() {
  logger.info('Starting Remi...');

  // Validate required env vars
  const required = ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET', 'SLACK_APP_TOKEN'];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Initialize Slack client
  const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
  const messenger = new SlackMessenger(slackClient);

  // Initialize Google auth
  const googleAuth = new GoogleAuth({
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/bigquery',
      'https://www.googleapis.com/auth/cloud-tasks',
    ],
  });

  // Initialize service clients
  const sheetsService = new GoogleSheetsService(googleAuth);
  const bqService = new BigQueryService(
    servicesConfig.googleCloud.projectId,
    servicesConfig.bigquery.location,
  );
  const cloudTasksService = new CloudTasksService(servicesConfig.googleCloud.projectId);

  // Initialize core engine
  const registry = new WorkflowRegistry();
  const engine = new WorkflowEngine({ messenger });
  const conversationManager = new ConversationManager(
    engine,
    registry,
    messenger,
    defaultConfig.conversationTtlMs,
  );

  // Register workflows
  registry.register(
    new SmsCampaignWorkflow({
      sheetsService,
      bqService,
      cloudTasksService,
    }),
  );

  logger.info({ workflows: registry.list().map((w) => w.name) }, 'Registered workflows');

  // Start conversation cleanup
  conversationManager.startCleanup();

  // Create and start Slack app
  const app = createSlackApp({
    botToken: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    appToken: process.env.SLACK_APP_TOKEN!,
    conversationManager,
  });

  await app.start();
  logger.info('Remi is running! Listening for @mentions...');
}

main().catch((error) => {
  logger.fatal({ error: error instanceof Error ? error.message : String(error) }, 'Failed to start Remi');
  process.exit(1);
});
