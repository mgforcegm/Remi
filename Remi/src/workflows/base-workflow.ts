import type {
  IWorkflow,
  IWorkflowStep,
  WorkflowContext,
  ValidationResult,
} from '../core/types';

export abstract class BaseWorkflow implements IWorkflow {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly description: string;

  protected abstract readonly keywords: string[];

  matches(message: string): boolean {
    const normalized = message.toLowerCase();
    return this.keywords.some((kw) => normalized.includes(kw));
  }

  abstract getSteps(): IWorkflowStep[];

  async onStepFailure(_failedStepIndex: number, _context: WorkflowContext): Promise<void> {
    // Default: no rollback. Subclasses override for cleanup.
  }

  validate(_context: WorkflowContext): ValidationResult {
    return { valid: true, errors: [] };
  }
}
