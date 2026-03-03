import { google, sheets_v4 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../utils/logger';
import type { IGoogleSheetsService, SpreadsheetMetadata, TabInfo } from '../core/types';

export class GoogleSheetsService implements IGoogleSheetsService {
  private sheets: sheets_v4.Sheets;

  constructor(auth: GoogleAuth) {
    this.sheets = google.sheets({ version: 'v4', auth: auth as any });
  }

  async getSpreadsheetMetadata(spreadsheetId: string): Promise<SpreadsheetMetadata> {
    const res = await this.sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'spreadsheetId,properties.title,sheets.properties',
    });

    const data = res.data;
    const tabs: TabInfo[] = (data.sheets || []).map((sheet) => ({
      sheetId: sheet.properties?.sheetId ?? 0,
      title: sheet.properties?.title ?? '',
      index: sheet.properties?.index ?? 0,
      rowCount: sheet.properties?.gridProperties?.rowCount ?? 0,
      columnCount: sheet.properties?.gridProperties?.columnCount ?? 0,
    }));

    return {
      spreadsheetId: data.spreadsheetId ?? spreadsheetId,
      title: data.properties?.title ?? '',
      tabs,
    };
  }

  async getTabByGid(spreadsheetId: string, gid: number): Promise<TabInfo> {
    const metadata = await this.getSpreadsheetMetadata(spreadsheetId);
    const tab = metadata.tabs.find((t) => t.sheetId === gid);
    if (!tab) {
      throw new Error(`Tab with gid=${gid} not found in spreadsheet ${spreadsheetId}`);
    }
    return tab;
  }

  async readRange(spreadsheetId: string, range: string): Promise<string[][]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    logger.info(
      { spreadsheetId, range, rowCount: res.data.values?.length ?? 0 },
      'Read range from Google Sheets',
    );

    return (res.data.values as string[][]) || [];
  }
}
