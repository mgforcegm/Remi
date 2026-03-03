import type { IWorkflowStep, StepResult, WorkflowContext, StepRetryConfig } from '../../../core/types';
import { DEFAULT_RETRY_CONFIG } from '../../../core/types/workflow';
import { extractSheetUrl, parseSheetUrl, parseScheduleTime, generateRequestId } from '../../../utils';

export class ParseRequestStep implements IWorkflowStep {
  readonly name = 'parseRequest';
  readonly displayName = 'Parsing your request';
  readonly retryConfig: StepRetryConfig = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 1, timeoutMs: 5_000 };

  async execute(context: WorkflowContext): Promise<StepResult> {
    const message = context.rawMessage;

    // Extract Google Sheet URL
    const sheetUrl = extractSheetUrl(message);
    if (!sheetUrl) {
      return {
        data: {},
        needsInput: true,
        question: 'I couldn\'t find a Google Sheets URL in your message. Could you share the sheet link?',
      };
    }

    const parsed = parseSheetUrl(sheetUrl);
    if (!parsed) {
      return {
        data: {},
        needsInput: true,
        question: 'That doesn\'t look like a valid Google Sheets URL. Could you double-check and share the link again?',
      };
    }

    // Parse schedule time (default to "now" if not specified)
    const scheduleTime = parseScheduleTime(message) ?? new Date();

    // Generate deterministic request_id
    const requestId = generateRequestId(context.slack.channel, context.slack.threadTs);

    return {
      data: {
        requestId,
        scheduleTime: scheduleTime.toISOString(),
        sourceSpreadsheetId: parsed.spreadsheetId,
        sourceGid: parsed.gid,
        sheetUrl,
      },
      statusMessage: `Parsed request. Sheet: \`${parsed.spreadsheetId}\`, Schedule: ${scheduleTime.toISOString()}`,
    };
  }
}
