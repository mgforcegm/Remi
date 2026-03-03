import type { IWorkflowStep, StepResult, WorkflowContext, StepRetryConfig } from '../../../core/types';
import { DEFAULT_RETRY_CONFIG } from '../../../core/types/workflow';
import type { IGoogleSheetsService } from '../../../core/types';
import { smsCampaignConfig } from '../../../../config/workflows/sms-campaign';

export class FetchOrderIdsStep implements IWorkflowStep {
  readonly name = 'fetchOrderIds';
  readonly displayName = 'Fetching order IDs from Google Sheet';
  readonly retryConfig: StepRetryConfig = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2, timeoutMs: 15_000 };

  constructor(private readonly sheetsService: IGoogleSheetsService) {}

  async execute(context: WorkflowContext): Promise<StepResult> {
    const { sourceSpreadsheetId, sourceGid } = context.data as {
      sourceSpreadsheetId: string;
      sourceGid: number | null;
    };

    // Resolve tab name
    let tabName: string;
    if (sourceGid !== null && sourceGid !== undefined) {
      const tab = await this.sheetsService.getTabByGid(sourceSpreadsheetId, sourceGid);
      tabName = tab.title;
    } else {
      // If no gid, get the first tab
      const metadata = await this.sheetsService.getSpreadsheetMetadata(sourceSpreadsheetId);
      if (metadata.tabs.length === 0) {
        throw new Error('The spreadsheet has no tabs.');
      }

      if (metadata.tabs.length > 1) {
        // Ask user which tab to use
        return {
          data: {},
          needsInput: true,
          question: 'Which tab should I read order IDs from?',
          options: metadata.tabs.map((t) => t.title),
        };
      }

      tabName = metadata.tabs[0].title;
    }

    // Read order IDs from the configured column
    const col = smsCampaignConfig.sourceSheet.orderIdColumn;
    const startRow = smsCampaignConfig.sourceSheet.dataStartRow;
    const range = `'${tabName}'!${col}${startRow}:${col}`;

    const rows = await this.sheetsService.readRange(sourceSpreadsheetId, range);
    const orderIds = rows
      .map((row) => row[0]?.trim())
      .filter((id): id is string => !!id);

    if (orderIds.length === 0) {
      throw new Error(`No order IDs found in column ${col} of tab "${tabName}".`);
    }

    // Deduplicate
    const uniqueIds = [...new Set(orderIds)];

    return {
      data: {
        orderIds: uniqueIds,
        sourceTabName: tabName,
      },
      statusMessage: `Found ${uniqueIds.length} unique order IDs in tab "${tabName}" (${orderIds.length} total rows).`,
    };
  }
}
