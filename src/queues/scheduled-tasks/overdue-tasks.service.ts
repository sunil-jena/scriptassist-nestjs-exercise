import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) {}

  // TODO: Implement the overdue tasks checker
  // This method should run every hour and check for overdue tasks
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    this.logger.debug('Checking for overdue tasks...');

    // TODO: Implement overdue tasks checking logic
    // 1. Find all tasks that are overdue (due date is in the past)
    // 2. Add them to the task processing queue
    // 3. Log the number of overdue tasks found

    // Example implementation (incomplete - to be implemented by candidates)
    const now = new Date();
    const overdueTasks = await this.tasksRepository.find({
      where: {
        dueDate: LessThan(now),
        status: TaskStatus.PENDING,
      },
      select: ['id'],
    });

    if (!overdueTasks.length) {
      this.logger.log('No overdue tasks found');
      return;
    }

    // this.logger.log(`Found ${overdueTasks.length} overdue tasks`);

    // Add tasks to the queue to be processed
    // TODO: Implement adding tasks to the queue
    const jobs = overdueTasks.map(t => ({
      name: 'process-overdue-task',
      data: { taskId: t.id },
      opts: {
        jobId: `overdue:${t.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    }));

    await this.taskQueue.addBulk(jobs);

    // (Optional) mark them as OVERDUE in one DB roundtrip
    await this.tasksRepository
      .createQueryBuilder()
      .update(Task)
      .set({ status: TaskStatus.COMPLETED })
      .whereInIds(overdueTasks.map(t => t.id))
      .andWhere('status = :pending', { pending: TaskStatus.PENDING })
      .execute();

    this.logger.log(`Queued ${overdueTasks.length} overdue tasks for processing`);
    this.logger.debug('Overdue tasks check completed');
  }
}
