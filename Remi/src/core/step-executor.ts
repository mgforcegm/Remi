import { retry } from '../utils/retry';
import { logger } from '../utils/logger';
import type { IWorkflowStep, WorkflowContext, StepResult, StepRetryConfig } from './types';

export class StepExecutionError extends Error {
  constructor(
    message: string,
    public readonly stepName: string,
    public readonly isRetryable: boolean,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'StepExecutionError';
  }
}

export async function executeStep(
  step: IWorkflowStep,
  context: WorkflowContext,
): Promise<StepResult> {
  const stepLogger = logger.child({ step: step.name, executionId: context.executionId });
  const startTime = Date.now();

  stepLogger.info('Starting step execution');

  try {
    const result = await retry(
      () => step.execute(context),
      {
        maxAttempts: step.retryConfig.maxAttempts,
        backoffMs: step.retryConfig.backoffMs,
        backoffMultiplier: step.retryConfig.backoffMultiplier,
        timeoutMs: step.retryConfig.timeoutMs,
        retryableErrors: step.retryConfig.retryableErrors,
      },
    );

    const durationMs = Date.now() - startTime;
    stepLogger.info(
      { durationMs, needsInput: result.needsInput, needsApproval: result.needsApproval },
      'Step completed successfully',
    );

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    stepLogger.error(
      { durationMs, error: error instanceof Error ? error.message : String(error) },
      'Step execution failed',
    );

    throw new StepExecutionError(
      `Step "${step.displayName}" failed: ${error instanceof Error ? error.message : String(error)}`,
      step.name,
      false,
      error instanceof Error ? error : undefined,
    );
  }
}
