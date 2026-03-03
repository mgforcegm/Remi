import type { IWorkflowStep, StepResult, WorkflowContext, StepRetryConfig, DatasetRef } from '../../../core/types';
import { DEFAULT_RETRY_CONFIG } from '../../../core/types/workflow';
import type { IBigQueryService } from '../../../core/types';
import { servicesConfig } from '../../../../config/services';

export class WriteAudienceTableStep implements IWorkflowStep {
  readonly name = 'writeAudienceTable';
  readonly displayName = 'Writing audience to BigQuery temp table';
  readonly retryConfig: StepRetryConfig = { ...DEFAULT_RETRY_CONFIG, maxAttempts: 2, timeoutMs: 30_000 };

  constructor(private readonly bqService: IBigQueryService) {}

  async execute(context: WorkflowContext): Promise<StepResult> {
    const { requestId, queryResults } = context.data as {
      requestId: string;
      queryResults: Record<string, unknown>[];
    };

    const tableId = `${servicesConfig.bigquery.audienceTablePrefix}_${requestId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    const datasetId = servicesConfig.bigquery.dataset;

    await this.bqService.writeToTable(datasetId, tableId, queryResults);

    const datasetRef: DatasetRef = {
      project: servicesConfig.googleCloud.projectId,
      dataset: datasetId,
      table: tableId,
    };

    return {
      data: {
        audienceTable: `${datasetRef.project}.${datasetRef.dataset}.${datasetRef.table}`,
        datasetRef,
      },
      statusMessage: `Audience table created: \`${tableId}\` (${queryResults.length} rows).`,
    };
  }
}
