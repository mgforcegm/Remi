import { z } from 'zod';

export const sheetUrlInputSchema = z.object({
  spreadsheetId: z.string().min(1),
  gid: z.number().nullable(),
});

export const orderIdsSchema = z.array(z.string().min(1)).min(1, 'At least one order ID is required');

export const scheduleTimeSchema = z.date().refine(
  (d) => d.getTime() >= Date.now() - 60_000, // Allow 1 min tolerance
  { message: 'Schedule time must be in the future' },
);
