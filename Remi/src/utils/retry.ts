import { logger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
  retryableErrors?: string[];
}

export class RetryableError extends Error {
  constructor(
    message: string,
    public readonly isRetryable: boolean = true,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}

function isRetryable(error: unknown, retryableErrors?: string[]): boolean {
  if (error instanceof RetryableError) return error.isRetryable;

  if (retryableErrors && error instanceof Error) {
    return retryableErrors.some(
      (code) => error.message.includes(code) || error.name.includes(code),
    );
  }

  // Default: retry on network/transient errors
  if (error instanceof Error) {
    const transient = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', '429', '503', '500'];
    return transient.some((code) => error.message.includes(code));
  }

  return false;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Step timed out')), options.timeoutMs),
        ),
      ]);
      return result;
    } catch (error) {
      lastError = error;

      if (attempt === options.maxAttempts || !isRetryable(error, options.retryableErrors)) {
        throw error;
      }

      const delay = options.backoffMs * Math.pow(options.backoffMultiplier, attempt - 1);
      logger.warn(
        { attempt, maxAttempts: options.maxAttempts, delay, error: String(error) },
        'Retrying after error',
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
