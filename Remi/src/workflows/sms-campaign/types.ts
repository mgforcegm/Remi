import type { DatasetRef } from '../../core/types';

export interface SmsCampaignContext {
  requestId: string;
  scheduleTime: Date;
  sourceSpreadsheetId: string;
  sourceGid: number | null;
  sourceTabName: string;
  orderIds: string[];
  bigQueryJobId: string;
  queryResultRowCount: number;
  queryResults: Record<string, unknown>[];
  audienceTable: string;
  datasetRef: DatasetRef;
  approvedBy: string;
  approvedAt: Date;
  cloudTaskName: string;
}

/** Helper to read typed fields from the generic context.data map */
export function getSmsCampaignData(data: Record<string, unknown>): Partial<SmsCampaignContext> {
  return data as Partial<SmsCampaignContext>;
}
