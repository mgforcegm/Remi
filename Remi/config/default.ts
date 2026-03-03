export const defaultConfig = {
  workflowTimeoutMs: Number(process.env.WORKFLOW_TIMEOUT_MS) || 300_000,
  conversationTtlMs: Number(process.env.CONVERSATION_TTL_MS) || 1_800_000,
  maxRecipients: Number(process.env.MAX_RECIPIENTS) || 10_000,
  logLevel: process.env.LOG_LEVEL || 'info',

  rbac: {
    allowedChannels: process.env.ALLOWED_CHANNELS?.split(',') || [],
    allowedUsers: process.env.ALLOWED_USERS?.split(',') || [],
    enforceRbac: process.env.ENFORCE_RBAC === 'true',
  },

  retry: {
    maxAttempts: 3,
    backoffMs: 1_000,
    backoffMultiplier: 2,
  },

  approval: {
    timeoutMs: 1_800_000, // 30 minutes
    approveKeywords: ['approve', 'approved', 'yes', 'confirm'],
    cancelKeywords: ['cancel', 'abort', 'no', 'stop'],
  },
};
