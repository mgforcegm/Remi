import { logger } from '../utils/logger';
import type { IWorkflow, IWorkflowRegistry } from './types';

export class WorkflowRegistry implements IWorkflowRegistry {
  private workflows: Map<string, IWorkflow> = new Map();

  register(workflow: IWorkflow): void {
    if (this.workflows.has(workflow.name)) {
      throw new Error(`Workflow "${workflow.name}" is already registered`);
    }
    this.workflows.set(workflow.name, workflow);
    logger.info({ workflow: workflow.name }, 'Registered workflow');
  }

  resolve(message: string): IWorkflow | null {
    const normalized = message.toLowerCase();
    for (const workflow of this.workflows.values()) {
      if (workflow.matches(normalized)) {
        logger.info({ workflow: workflow.name, message: normalized.slice(0, 100) }, 'Resolved workflow');
        return workflow;
      }
    }
    return null;
  }

  list(): IWorkflow[] {
    return Array.from(this.workflows.values());
  }
}
