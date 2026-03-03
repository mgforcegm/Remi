import type {
  IWorkflowStep,
  StepResult,
  WorkflowContext,
  StepRetryConfig,
  ICloudTasksService,
  DatasetRef,
  DispatchPayload,
} from '../../../core/types';
import { DEFAULT_RETRY_CONFIG } from '../../../core/types/workflow';
import { formatTimeET, formatTimeUTC } from '../../../utils';
import { smsCampaignConfig } from '../../../../config/workflows/sms-campaign';

export class CreateCloudTaskStep implements IWorkflowStep {
  readonly name = 'createCloudTask';
  readonly displayName = 'Scheduling deployment via Cloud Tasks';
  readonly retryConfig: StepRetryConfig = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2, timeoutMs: 15_000 };

  constructor(private readonly cloudTasksService: ICloudTasksService) {}

  async execute(context: WorkflowContext): Promise<StepResult> {
    const {
      requestId,
      scheduleTime,
      datasetRef,
    } = context.data as {
      requestId: string;
      scheduleTime: string;
      datasetRef: DatasetRef;
    };

    const scheduleDt = new Date(scheduleTime);

    const payload: DispatchPayload = {
      request_id: requestId,
      scheduled_for: scheduleDt.toISOString(),
      dataset_ref: datasetRef,
      deployment: {
        kafka_topic: smsCampaignConfig.deployment.kafkaTopic,
        template_id: smsCampaignConfig.deployment.templateId,
        variant: smsCampaignConfig.deployment.variant,
      },
      audit: {
        requested_by: context.slack.userId,
        approved_by: context.slack.userId, // Same user for now
        approved_at: new Date().toISOString(),
        channel: context.slack.channel,
        thread_ts: context.slack.threadTs,
      },
      slack_callback: {
        channel: context.slack.channel,
        thread_ts: context.slack.threadTs,
        bot_token_secret: process.env.SLACK_BOT_TOKEN_SECRET_NAME || 'remi-slack-bot-token',
      },
    };

    const { taskName } = await this.cloudTasksService.createDispatchTask(payload, scheduleDt);

    const summary = [
      `*SMS Campaign Scheduled*`,
      '',
      `:clock3: *Scheduled for*: ${formatTimeET(scheduleDt)} (${formatTimeUTC(scheduleDt)})`,
      `:id: *Request ID*: \`${requestId}\``,
      `:label: *Task*: \`${taskName}\``,
      '',
      `I'll post an update here when the deployment fires.`,
    ].join('\n');

    return {
      data: {
        cloudTaskName: taskName,
        approvedBy: context.slack.userId,
        approvedAt: new Date().toISOString(),
      },
      statusMessage: summary,
    };
  }
}
