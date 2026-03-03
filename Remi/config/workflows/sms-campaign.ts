export const smsCampaignConfig = {
  name: 'sms-campaign',
  displayName: 'SMS Campaign',
  description: 'Send SMS messages via Braze using order data from Google Sheets',

  keywords: ['sms', 'campaign', 'text message', 'braze', 'send sms'],

  bigquery: {
    // The query template with placeholders — user will provide the actual query
    queryTemplate: `
      SELECT order_id, customer_phone, customer_name, order_total
      FROM \`{{project}}.{{dataset}}.orders\`
      WHERE order_id IN UNNEST(@orderIds)
        AND order_date BETWEEN @startDate AND @endDate
    `,
  },

  sourceSheet: {
    orderIdColumn: 'A',
    headerRow: 1,
    dataStartRow: 2,
  },

  deployment: {
    kafkaTopic: process.env.KAFKA_TOPIC || 'sms.deployment.requests',
    templateId: process.env.BRAZE_TEMPLATE_ID || '',
    variant: process.env.BRAZE_VARIANT || undefined,
  },

  steps: {
    parseRequest: { maxAttempts: 1, timeoutMs: 5_000 },
    fetchOrderIds: { maxAttempts: 2, timeoutMs: 15_000 },
    runBigQuery: { maxAttempts: 1, timeoutMs: 60_000 },
    writeAudienceTable: { maxAttempts: 2, timeoutMs: 30_000 },
    previewAndApprove: { maxAttempts: 1, timeoutMs: 1_800_000 },
    createCloudTask: { maxAttempts: 2, timeoutMs: 15_000 },
  },
};
