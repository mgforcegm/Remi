export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  tabs: TabInfo[];
}

export interface TabInfo {
  sheetId: number;
  title: string;
  index: number;
  rowCount: number;
  columnCount: number;
}

export interface BigQueryJobResult {
  jobId: string;
  status: 'DONE' | 'RUNNING' | 'PENDING';
  totalRows: number;
  totalBytesProcessed: number;
  rows: Record<string, unknown>[];
}

export interface DatasetRef {
  project: string;
  dataset: string;
  table: string;
}

export interface DispatchPayload {
  request_id: string;
  scheduled_for: string;
  dataset_ref: DatasetRef;
  deployment: {
    kafka_topic: string;
    template_id: string;
    variant?: string;
  };
  audit: {
    requested_by: string;
    approved_by: string;
    approved_at: string;
    channel: string;
    thread_ts: string;
  };
  slack_callback: {
    channel: string;
    thread_ts: string;
    bot_token_secret: string;
  };
}

export interface IGoogleSheetsService {
  getSpreadsheetMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata>;
  getTabByGid(spreadsheetId: string, gid: number): Promise<TabInfo>;
  readRange(spreadsheetId: string, range: string): Promise<string[][]>;
}

export interface IBigQueryService {
  runParameterizedQuery(
    query: string,
    params: Record<string, unknown>,
  ): Promise<BigQueryJobResult>;
  writeToTable(
    datasetId: string,
    tableId: string,
    rows: Record<string, unknown>[],
  ): Promise<void>;
  deleteTable(datasetId: string, tableId: string): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
}

export interface ICloudTasksService {
  createDispatchTask(
    payload: DispatchPayload,
    scheduleTime: Date,
  ): Promise<{ taskName: string }>;
  deleteTask(taskName: string): Promise<void>;
}

export interface ISlackMessenger {
  postStatus(channel: string, threadTs: string, message: string): Promise<void>;
  postError(channel: string, threadTs: string, error: Error): Promise<void>;
  askQuestion(
    channel: string,
    threadTs: string,
    question: string,
    options?: string[],
  ): Promise<void>;
  postApprovalRequest(
    channel: string,
    threadTs: string,
    summary: string,
  ): Promise<void>;
  postCompletion(channel: string, threadTs: string, summary: string): Promise<void>;
}
