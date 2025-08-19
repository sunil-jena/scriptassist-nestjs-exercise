/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

type StatusUpdatePayload = { taskId: string; status: TaskStatus | string };
type StatusBatchPayload = { taskIds: string[]; status: TaskStatus | string };

function isValidStatus(value: any): value is TaskStatus {
  return Object.values(TaskStatus).includes(value);
}

@Processor('task-processing', { concurrency: 8 }) // run up to 8 jobs concurrently
@Injectable()
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService) {
    super();
  }

  /**
   * Central job router. Throwing an error signals BullMQ to retry.
   */
  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} [${job.name}]`);

    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);

        case 'task-status-batch':
          return await this.handleStatusBatch(job);

        case 'overdue-tasks-notification':
          return await this.handleOverdueTasks(job);

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          // return success:false but do NOT throw (won’t retry unknown job types)
          return { success: false, error: `Unknown job type: ${job.name}` };
      }
    } catch (error) {
      // Throw so BullMQ uses attempts/backoff to retry
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Job ${job.id} failed [${job.name}]: ${msg}`, (error as any)?.stack);
      throw error;
    }
  }

  /**
   * Single status update job
   * Data: { taskId: string, status: TaskStatus }
   */
  private async handleStatusUpdate(job: Job<StatusUpdatePayload>) {
    const { taskId, status } = job.data ?? ({} as any);

    if (!taskId || !status) {
      return { success: false, error: 'Missing required data: taskId, status' };
    }

    const normalized = typeof status === 'string' ? status.toUpperCase() : status;
    if (!isValidStatus(normalized)) {
      return { success: false, error: `Invalid status value: ${status}` };
    }

    const task = await this.tasksService.updateStatus(taskId, normalized);
    return { success: true, taskId: task.id, newStatus: task.status };
  }

  /**
   * Batch status update job
   * Data: { taskIds: string[], status: TaskStatus }
   * Uses a single UPDATE under the hood (via service) and returns per-id results.
   */
  private async handleStatusBatch(job: Job<StatusBatchPayload>) {
    const { taskIds, status } = job.data ?? ({} as any);

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return { success: false, error: 'taskIds must be a non-empty array' };
    }

    const normalized = typeof status === 'string' ? status.toUpperCase() : status;
    if (!isValidStatus(normalized)) {
      return { success: false, error: `Invalid status value: ${status}` };
    }

    // Chunk to avoid huge IN() lists; tune chunk size as needed
    const CHUNK = 500;
    const results = { success: [] as string[], failed: [] as { id: string; error: string }[] };

    for (let i = 0; i < taskIds.length; i += CHUNK) {
      const slice = taskIds.slice(i, i + CHUNK);
      const r = await this.tasksService.batchUpdateStatus(slice, normalized);
      results.success.push(...r.success);
      results.failed.push(...r.failed);
    }

    return { success: true, updated: results.success.length, results };
  }

  /**
   * Overdue tasks job – placeholder.
   * You can add a repository method to fetch overdue tasks and then notify users.
   * Keep the processor lean: orchestrate; delegate heavy lifting to services.
   */
  private async handleOverdueTasks(job: Job) {
    this.logger.debug('Processing overdue tasks notification');
    // Example outline:
    // const overdue = await this.tasksService.findOverdue({ limit: 1000 });
    // chunk & notify...
    return { success: true, message: 'Overdue tasks processed (stub)' };
  }
}
