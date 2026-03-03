import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { executeStep, StepExecutionError } from './step-executor';
import type { IWorkflow, WorkflowContext, ISlackMessenger } from './types';

export interface WorkflowEngineOptions {
  messenger: ISlackMessenger;
}

export type InputResolver = (input: string) => void;

export interface WorkflowPause {
  type: 'input' | 'approval';
  question: string;
  resolve: InputResolver;
}

export class WorkflowEngine {
  private messenger: ISlackMessenger;

  constructor(options: WorkflowEngineOptions) {
    this.messenger = options.messenger;
  }

  /**
   * Execute a workflow. Returns a promise that resolves when the workflow completes.
   * If a step needs input/approval, returns a WorkflowPause object via the onPause callback.
   * Call pause.resolve(userInput) to resume the workflow.
   */
  async execute(
    workflow: IWorkflow,
    slackContext: { channel: string; threadTs: string; userId: string; botUserId: string },
    rawMessage: string,
    config: Record<string, unknown>,
    onPause: (pause: WorkflowPause) => void,
  ): Promise<{ success: boolean; context: WorkflowContext }> {
    const context: WorkflowContext = {
      executionId: uuidv4(),
      workflowName: workflow.name,
      slack: slackContext,
      rawMessage,
      data: {},
      currentStepIndex: 0,
      startedAt: new Date(),
      config,
    };

    const engineLogger = logger.child({
      executionId: context.executionId,
      workflow: workflow.name,
    });

    // Validate before starting
    const validation = workflow.validate(context);
    if (!validation.valid) {
      const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
      await this.messenger.postError(slackContext.channel, slackContext.threadTs, new Error(errorMsg));
      return { success: false, context };
    }

    const steps = workflow.getSteps();
    const totalSteps = steps.length;

    engineLogger.info({ totalSteps }, 'Starting workflow execution');

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      context.currentStepIndex = i;

      // Post step progress
      await this.messenger.postStatus(
        slackContext.channel,
        slackContext.threadTs,
        `:hourglass_flowing_sand: Step ${i + 1}/${totalSteps}: ${step.displayName}...`,
      );

      try {
        const result = await executeStep(step, context);

        // Merge step data into context
        Object.assign(context.data, result.data);

        // Post step completion status
        if (result.statusMessage) {
          await this.messenger.postStatus(
            slackContext.channel,
            slackContext.threadTs,
            `:white_check_mark: ${result.statusMessage}`,
          );
        }

        // Handle pause for input or approval
        if (result.needsInput || result.needsApproval) {
          const question = result.question ?? 'Please provide input to continue.';

          if (result.needsApproval) {
            await this.messenger.postApprovalRequest(
              slackContext.channel,
              slackContext.threadTs,
              question,
            );
          } else if (result.options?.length) {
            await this.messenger.askQuestion(
              slackContext.channel,
              slackContext.threadTs,
              question,
              result.options,
            );
          } else {
            await this.messenger.askQuestion(
              slackContext.channel,
              slackContext.threadTs,
              question,
            );
          }

          // Pause execution and wait for user input
          const userInput = await new Promise<string>((resolve) => {
            onPause({
              type: result.needsApproval ? 'approval' : 'input',
              question,
              resolve,
            });
          });

          // Store the user's response in context
          context.data[`${step.name}_userInput`] = userInput;

          // For approval steps, check if the user cancelled
          if (result.needsApproval) {
            const normalized = userInput.toLowerCase().trim();
            const cancelled = ['cancel', 'abort', 'no', 'stop'].some((kw) =>
              normalized.includes(kw),
            );
            if (cancelled) {
              await this.messenger.postStatus(
                slackContext.channel,
                slackContext.threadTs,
                ':no_entry_sign: Workflow cancelled by user.',
              );
              engineLogger.info('Workflow cancelled by user at approval gate');
              return { success: false, context };
            }
          }
        }
      } catch (error) {
        engineLogger.error(
          { step: step.name, error: error instanceof Error ? error.message : String(error) },
          'Workflow step failed',
        );

        // Attempt rollback
        try {
          await workflow.onStepFailure(i, context);
        } catch (rollbackError) {
          engineLogger.error(
            { error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError) },
            'Rollback also failed',
          );
        }

        const userMessage =
          error instanceof StepExecutionError
            ? error.message
            : `Step "${step.displayName}" encountered an unexpected error.`;

        await this.messenger.postError(
          slackContext.channel,
          slackContext.threadTs,
          new Error(userMessage),
        );

        return { success: false, context };
      }
    }

    engineLogger.info('Workflow completed successfully');
    return { success: true, context };
  }
}
