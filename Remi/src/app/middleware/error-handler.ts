import type { CodedError } from '@slack/bolt';
import { logger } from '../../utils/logger';

export async function globalErrorHandler(error: CodedError): Promise<void> {
  logger.error(
    { code: error.code, message: error.message, stack: error.stack },
    'Unhandled Slack Bolt error',
  );
}
