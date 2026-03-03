import { BigQuery } from '@google-cloud/bigquery';
import { logger } from '../utils/logger';
import type { IBigQueryService, BigQueryJobResult } from '../core/types';

export class BigQueryService implements IBigQueryService {
  private bq: BigQuery;

  constructor(projectId: string, location: string) {
    this.bq = new BigQuery({ projectId, location });
  }

  async runParameterizedQuery(
    query: string,
    params: Record<string, unknown>,
  ): Promise<BigQueryJobResult> {
    logger.info({ queryLength: query.length, paramKeys: Object.keys(params) }, 'Running BigQuery query');

    const [job] = await this.bq.createQueryJob({
      query,
      params,
      useLegacySql: false,
    });

    const jobId = job.id ?? '';
    logger.info({ jobId }, 'BigQuery job created, waiting for completion');

    const [rows] = await job.getQueryResults();
    const [metadata] = await job.getMetadata();

    const result: BigQueryJobResult = {
      jobId,
      status: 'DONE',
      totalRows: rows.length,
      totalBytesProcessed: Number(metadata.statistics?.totalBytesProcessed ?? 0),
      rows: rows as Record<string, unknown>[],
    };

    logger.info(
      { jobId, totalRows: result.totalRows, bytesProcessed: result.totalBytesProcessed },
      'BigQuery query completed',
    );

    return result;
  }

  async writeToTable(
    datasetId: string,
    tableId: string,
    rows: Record<string, unknown>[],
  ): Promise<void> {
    const dataset = this.bq.dataset(datasetId);
    const table = dataset.table(tableId);

    // Create table if it doesn't exist (schema inferred from first row)
    const [exists] = await table.exists();
    if (!exists) {
      logger.info({ datasetId, tableId }, 'Creating BigQuery table');
      await dataset.createTable(tableId, {
        schema: { fields: this.inferSchema(rows[0]) },
      });
    }

    await table.insert(rows);
    logger.info({ datasetId, tableId, rowCount: rows.length }, 'Wrote rows to BigQuery table');
  }

  async deleteTable(datasetId: string, tableId: string): Promise<void> {
    try {
      await this.bq.dataset(datasetId).table(tableId).delete();
      logger.info({ datasetId, tableId }, 'Deleted BigQuery table');
    } catch (error) {
      logger.warn({ datasetId, tableId, error: String(error) }, 'Failed to delete table (may not exist)');
    }
  }

  async cancelJob(jobId: string): Promise<void> {
    try {
      const job = this.bq.job(jobId);
      await job.cancel();
      logger.info({ jobId }, 'Cancelled BigQuery job');
    } catch (error) {
      logger.warn({ jobId, error: String(error) }, 'Failed to cancel job');
    }
  }

  private inferSchema(row: Record<string, unknown>) {
    return Object.entries(row).map(([name, value]) => ({
      name,
      type: typeof value === 'number'
        ? 'FLOAT64'
        : typeof value === 'boolean'
          ? 'BOOL'
          : 'STRING',
    }));
  }
}
