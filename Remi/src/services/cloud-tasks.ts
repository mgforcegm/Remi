import { CloudTasksClient } from '@google-cloud/tasks';
import { logger } from '../utils/logger';
import { servicesConfig } from '../../config/services';
import type { ICloudTasksService, DispatchPayload } from '../core/types';

export class CloudTasksService implements ICloudTasksService {
  private client: CloudTasksClient;
  private queuePath: string;

  constructor(projectId: string) {
    this.client = new CloudTasksClient();
    this.queuePath = this.client.queuePath(
      projectId,
      servicesConfig.cloudTasks.location,
      servicesConfig.cloudTasks.queue,
    );
  }

  async createDispatchTask(
    payload: DispatchPayload,
    scheduleTime: Date,
  ): Promise<{ taskName: string }> {
    const taskId = `remi-dispatch-${payload.request_id}`;

    const [task] = await this.client.createTask({
      parent: this.queuePath,
      task: {
        name: `${this.queuePath}/tasks/${taskId}`,
        scheduleTime: {
          seconds: Math.floor(scheduleTime.getTime() / 1000),
        },
        httpRequest: {
          httpMethod: 'POST',
          url: servicesConfig.cloudTasks.dispatcherUrl,
          headers: { 'Content-Type': 'application/json' },
          body: Buffer.from(JSON.stringify(payload)).toString('base64'),
          oidcToken: {
            serviceAccountEmail: servicesConfig.cloudTasks.dispatcherServiceAccount,
          },
        },
      },
    });

    const taskName = task.name ?? taskId;

    logger.info(
      {
        taskName,
        requestId: payload.request_id,
        scheduleTime: scheduleTime.toISOString(),
        dispatcherUrl: servicesConfig.cloudTasks.dispatcherUrl,
      },
      'Created Cloud Tasks dispatch task',
    );

    return { taskName };
  }

  async deleteTask(taskName: string): Promise<void> {
    try {
      await this.client.deleteTask({ name: taskName });
      logger.info({ taskName }, 'Deleted Cloud Tasks task');
    } catch (error) {
      logger.warn({ taskName, error: String(error) }, 'Failed to delete task (may have already executed)');
    }
  }
}
