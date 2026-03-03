import { z } from 'zod';

export const DatasetRefSchema = z.object({
  project: z.string().min(1),
  dataset: z.string().min(1),
  table: z.string().min(1),
});

export const DeploymentSchema = z.object({
  kafka_topic: z.string().min(1),
  template_id: z.string().min(1),
  variant: z.string().optional(),
});

export const AuditSchema = z.object({
  requested_by: z.string().min(1),
  approved_by: z.string().min(1),
  approved_at: z.string().datetime(),
  channel: z.string().min(1),
  thread_ts: z.string().min(1),
});

export const SlackCallbackSchema = z.object({
  channel: z.string().min(1),
  thread_ts: z.string().min(1),
  bot_token_secret: z.string().min(1),
});

export const DispatchPayloadSchema = z.object({
  request_id: z.string().regex(/^remi_\d{8}_[a-f0-9]{6}$/, 'Invalid request_id format'),
  scheduled_for: z.string().datetime(),
  dataset_ref: DatasetRefSchema,
  deployment: DeploymentSchema,
  audit: AuditSchema,
  slack_callback: SlackCallbackSchema,
});

export type DispatchPayload = z.infer<typeof DispatchPayloadSchema>;
