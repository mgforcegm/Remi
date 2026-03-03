export interface StepRetryConfig {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
  timeoutMs: number;
  retryableErrors?: string[];
}

export const DEFAULT_RETRY_CONFIG: StepRetryConfig = {
  maxAttempts: 3,
  backoffMs: 1_000,
  backoffMultiplier: 2,
  timeoutMs: 30_000,
};

export interface StepResult {
  /** Data to merge into the workflow context */
  data: Record<string, unknown>;
  /** Pause for generic user input */
  needsInput?: boolean;
  /** Pause specifically for APPROVE/CANCEL gate */
  needsApproval?: boolean;
  /** Question to post in Slack thread */
  question?: string;
  /** Numbered options for the user */
  options?: string[];
  /** Status message to post after step completes */
  statusMessage?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string }>;
}

export interface WorkflowContext {
  executionId: string;
  workflowName: string;
  slack: {
    channel: string;
    threadTs: string;
    userId: string;
    botUserId: string;
  };
  rawMessage: string;
  data: Record<string, unknown>;
  currentStepIndex: number;
  startedAt: Date;
  config: Record<string, unknown>;
}

export interface IWorkflowStep {
  readonly name: string;
  readonly displayName: string;
  readonly retryConfig: StepRetryConfig;
  execute(context: WorkflowContext): Promise<StepResult>;
}

export interface IWorkflow {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  matches(message: string): boolean;
  getSteps(): IWorkflowStep[];
  onStepFailure(failedStepIndex: number, context: WorkflowContext): Promise<void>;
  validate(context: WorkflowContext): ValidationResult;
}

export interface IWorkflowRegistry {
  register(workflow: IWorkflow): void;
  resolve(message: string): IWorkflow | null;
  list(): IWorkflow[];
}
