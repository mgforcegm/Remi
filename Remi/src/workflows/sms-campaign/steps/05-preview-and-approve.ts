import type { IWorkflowStep, StepResult, WorkflowContext, StepRetryConfig, DatasetRef } from '../../../core/types';
import { DEFAULT_RETRY_CONFIG } from '../../../core/types/workflow';
import { formatTimeET, formatTimeUTC } from '../../../utils';
import { defaultConfig } from '../../../../config/default';

export class PreviewAndApproveStep implements IWorkflowStep {
  readonly name = 'previewAndApprove';
  readonly displayName = 'Preparing preview for approval';
  readonly retryConfig: StepRetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    maxAttempts: 1,
    timeoutMs: defaultConfig.approval.timeoutMs,
  };

  async execute(context: WorkflowContext): Promise<StepResult> {
    const {
      requestId,
      scheduleTime,
      queryResultRowCount,
      queryResults,
      sourceTabName,
      orderIds,
      audienceTable,
    } = context.data as {
      requestId: string;
      scheduleTime: string;
      queryResultRowCount: number;
      queryResults: Record<string, unknown>[];
      sourceTabName: string;
      orderIds: string[];
      audienceTable: string;
    };

    const scheduleDt = new Date(scheduleTime);
    const recipientCount = queryResultRowCount;

    // Threshold check
    if (recipientCount > defaultConfig.maxRecipients) {
      return {
        data: {},
        needsApproval: true,
        question: [
          `:warning: *High recipient count detected*`,
          '',
          `Recipients: *${recipientCount}* (exceeds threshold of ${defaultConfig.maxRecipients})`,
          `Source: ${orderIds.length} order IDs from tab "${sourceTabName}"`,
          `Audience table: \`${audienceTable}\``,
          `Scheduled for: ${formatTimeET(scheduleDt)} (${formatTimeUTC(scheduleDt)})`,
          `Request ID: \`${requestId}\``,
          '',
          `*Are you sure you want to proceed with ${recipientCount} recipients?*`,
        ].join('\n'),
      };
    }

    // Build preview with masked sample rows
    const sampleRows = queryResults.slice(0, 5).map((row) => {
      const masked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key.toLowerCase().includes('phone')) {
          const str = String(value);
          masked[key] = str.slice(0, 3) + '****' + str.slice(-2);
        } else {
          masked[key] = value;
        }
      }
      return masked;
    });

    const sampleTable = sampleRows
      .map((row) => Object.values(row).join(' | '))
      .join('\n');

    const summary = [
      `:clipboard: *Campaign Preview*`,
      '',
      `*Recipients*: ${recipientCount}`,
      `*Source*: ${orderIds.length} order IDs from tab "${sourceTabName}"`,
      `*Audience table*: \`${audienceTable}\``,
      `*Scheduled for*: ${formatTimeET(scheduleDt)} (${formatTimeUTC(scheduleDt)})`,
      `*Request ID*: \`${requestId}\``,
      '',
      `*Sample rows* (phone numbers masked):`,
      '```',
      sampleTable,
      '```',
    ].join('\n');

    return {
      data: {},
      needsApproval: true,
      question: summary,
    };
  }
}
