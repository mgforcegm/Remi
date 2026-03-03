import type { IWorkflowStep, StepResult, WorkflowContext, StepRetryConfig } from '../../../core/types';
import { DEFAULT_RETRY_CONFIG } from '../../../core/types/workflow';
import type { IBigQueryService } from '../../../core/types';
import { smsCampaignConfig } from '../../../../config/workflows/sms-campaign';
import { servicesConfig } from '../../../../config/services';

export class RunBigQueryStep implements IWorkflowStep {
  readonly name = 'runBigQuery';
  readonly displayName = 'Running BigQuery query';
  readonly retryConfig: StepRetryConfig = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 1, timeoutMs: 60_000 };

  constructor(private readonly bqService: IBigQueryService) {}

  async execute(context: WorkflowContext): Promise<StepResult> {
    const { orderIds } = context.data as { orderIds: string[] };

    // Build the parameterized query
    const query = smsCampaignConfig.bigquery.queryTemplate
      .replace('{{project}}', servicesConfig.googleCloud.projectId)
      .replace('{{dataset}}', servicesConfig.bigquery.dataset);

    // Run query with order IDs as a parameter
    const result = await this.bqService.runParameterizedQuery(query, {
      orderIds,
      startDate: context.data.startDate ?? '2020-01-01',
      endDate: context.data.endDate ?? new Date().toISOString().split('T')[0],
    });

    if (result.totalRows === 0) {
      throw new Error('BigQuery query returned 0 rows. No matching records found for the provided order IDs.');
    }

    return {
      data: {
        bigQueryJobId: result.jobId,
        queryResultRowCount: result.totalRows,
        queryResults: result.rows,
      },
      statusMessage: `Query complete. Found ${result.totalRows} matching records (processed ${(result.totalBytesProcessed / 1024 / 1024).toFixed(1)} MB).`,
    };
  }
}
