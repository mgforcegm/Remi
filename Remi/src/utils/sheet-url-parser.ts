import { z } from 'zod';

export interface ParsedSheetUrl {
  spreadsheetId: string;
  gid: number | null;
}

const SHEET_URL_REGEX =
  /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/[^#]*)?(?:#gid=(\d+))?/;

export function parseSheetUrl(url: string): ParsedSheetUrl | null {
  const match = url.match(SHEET_URL_REGEX);
  if (!match) return null;

  return {
    spreadsheetId: match[1],
    gid: match[2] ? parseInt(match[2], 10) : null,
  };
}

export function extractSheetUrl(message: string): string | null {
  const urlRegex = /https?:\/\/docs\.google\.com\/spreadsheets\/d\/[^\s>]+/;
  const match = message.match(urlRegex);
  return match ? match[0] : null;
}

export const sheetUrlSchema = z.string().refine(
  (url) => parseSheetUrl(url) !== null,
  { message: 'Invalid Google Sheets URL' },
);
