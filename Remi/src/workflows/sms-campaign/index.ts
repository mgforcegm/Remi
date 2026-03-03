import { BaseWorkflow } from '../base-workflow';
import { smsCampaignConfig } from '../../../config/workflows/sms-campaign';
import {
  ParseRequestStep,
  FetchOrderIdsStep,
  RunBigQueryStep,
  WriteAudienceTableStep,
  PreviewAndApproveStep,
  CreateCloudTaskStep,
} from './steps';
import { logger } from '../../utils/logger';
import type {
  IWorkflowStep,
  WorkflowContext,
  IGoogleSheetsService,
  IBigQueryService,
  ICloudTasksService,
} from '../../core/types';
import { servicesConfig } from '../../../config/services';

export interface SmsCampaignDeps {
  sheetsService: IGoogleSheetsService;
  bqService: IBigQueryService;
  cloudTasksService: ICloudTasksService;
}

export class SmsCampaignWorkflow extends BaseWorkflow {
  readonly name = smsCampaignConfig.name;
  readonly displayName = smsCampaignConfig.displayName;
  readonly description = smsCampaignConfig.description;
  protected readonly keywords = smsCampaignConfig.keywords;

  constructor(private readonly deps: SmsCampaignDeps) {
    super();
  }

  getSteps(): IWorkflowStep[] {
    return [
      new ParseRequestStep(),
      new FetchOrderIdsStep(this.deps.sheetsService),
      new RunBigQueryStep(this.deps.bqService),
      new WriteAudienceTableStep(this.deps.bqService),
      new PreviewAndApproveStep(),
      new CreateCloudTaskStep(this.deps.cloudTasksService),
    ];
  }

  async onStepFailure(failedStepIndex: number, context: WorkflowContext): Promise<void> {
    const rollbackLogger = logger.child({
      executionId: context.executionId,
      failedStep: failedStepIndex,
    });

    // If we created an audience table (step 3+), delete it
    if (failedStepIndex >= 3 && context.data.datasetRef) {
      const ref = context.data.datasetRef as { dataset: string; table: string };
      rollbackLogger.info({ table: ref.table }, 'Rolling back: deleting audience table');
      try {
        await this.deps.bqService.deleteTable(ref.dataset, ref.table);
      } catch (err) {
        rollbackLogger.warn({ error: String(err) }, 'Failed to delete audience table during rollback');
      }
    }

    // If we created a Cloud Task (step 5+), delete it
    if (failedStepIndex >= 5 && context.data.cloudTaskName) {
      rollbackLogger.info({ task: context.data.cloudTaskName }, 'Rolling back: deleting Cloud Task');
      try {
        await this.deps.cloudTasksService.deleteTask(context.data.cloudTaskName as string);
      } catch (err) {
        rollbackLogger.warn({ error: String(err) }, 'Failed to delete Cloud Task during rollback');
      }
    }
  }
}
