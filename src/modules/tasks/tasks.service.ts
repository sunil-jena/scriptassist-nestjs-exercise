/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const repo = qr.manager.getRepository(Task);
      const entity = repo.create(createTaskDto);
      const saved = await repo.save(entity);

      await qr.commitTransaction();

      try {
        await this.taskQueue.add(
          'task-status-update',
          { taskId: saved.id, status: saved.status },
          {
            jobId: `task-status-${saved.id}-${Date.now()}`,
            attempts: 5,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        );
      } catch (queueErr) {
        this.logger.warn(`Queue enqueue failed for task ${saved.id}: ${queueErr}`);
      }

      return await this.tasksRepository.findOneOrFail({
        where: { id: saved.id },
        relations: ['user'],
      });
    } catch (error) {
      await qr.rollbackTransaction();
      this.logger.error('Error creating task', error as Error);
      throw new InternalServerErrorException('Failed to create task');
    } finally {
      await qr.release();
    }
  }

  async findAll(
    status?: TaskStatus,
    priority?: TaskPriority,
    page?: number,
    limit?: number,
  ): Promise<{
    data: Task[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      const pageNum = Number(page) > 0 ? Number(page) : 1;
      const limitNum = Math.min(Math.max(Number(limit) || 10, 1), 100);

      const qb = this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.user', 'user')
        .orderBy('task.createdAt', 'DESC')
        .addOrderBy('task.id', 'DESC')
        .skip((pageNum - 1) * limitNum)
        .take(limitNum);

      if (status) {
        qb.andWhere('task.status = :status', { status });
      }

      if (priority) {
        qb.andWhere('task.priority = :priority', { priority });
      }

      const [data, total] = await qb.getManyAndCount();

      return {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      };
    } catch (error) {
      this.logger.error('Database error in findAll', error as Error);
      throw new InternalServerErrorException('Could not retrieve tasks');
    }
  }

  async findOne(id: string): Promise<Task> {
    try {
      const task = await this.tasksRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      return task;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error fetching task with ID ${id}`, error as Error);
      throw new InternalServerErrorException('Failed to fetch task');
    }
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const repo = qr.manager.getRepository(Task);
      const task = await repo.findOne({ where: { id } });
      if (!task) throw new NotFoundException(`Task with ID ${id} not found`);

      const prevStatus = task.status;
      Object.assign(task, updateTaskDto);

      await repo.save(task);
      await qr.commitTransaction();

      if (prevStatus !== task.status) {
        try {
          await this.taskQueue.add(
            'task-status-update',
            { taskId: task.id, status: task.status },
            {
              jobId: `task-status-${task.id}-${Date.now()}`,
              attempts: 5,
              backoff: { type: 'exponential', delay: 5_000 },
              removeOnComplete: 1000,
              removeOnFail: 5000,
            },
          );
        } catch (queueErr) {
          this.logger.warn(`Failed to enqueue task update for ID ${id}: ${queueErr}`);
        }
      }

      return await this.tasksRepository.findOneOrFail({ where: { id }, relations: ['user'] });
    } catch (error) {
      await qr.rollbackTransaction();
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error updating task with ID ${id}`, error as Error);
      throw new InternalServerErrorException('Failed to update task');
    } finally {
      await qr.release();
    }
  }

  async remove(id: string): Promise<void> {
    try {
      const result = await this.tasksRepository.delete(id);
      if (!result.affected) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error deleting task with ID ${id}`, error as Error);
      throw new InternalServerErrorException('Failed to delete task');
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    try {
      return await this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.user', 'user')
        .where('task.status = :status', { status })
        .orderBy('task.createdAt', 'DESC')
        .addOrderBy('task.id', 'DESC')
        .getMany();
    } catch (error) {
      this.logger.error(`Error finding tasks by status ${status}`, error as Error);
      throw new InternalServerErrorException('Failed to fetch tasks by status');
    }
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    try {
      const res = await this.tasksRepository
        .createQueryBuilder()
        .update(Task)
        .set({ status: status as TaskStatus })
        .where('id = :id', { id })
        .returning('*')
        .execute();

      if (!res.affected) throw new NotFoundException(`Task with ID ${id} not found`);

      const updated = await this.tasksRepository.findOne({
        where: { id },
        relations: ['user'],
      });
      if (!updated) throw new NotFoundException(`Task with ID ${id} not found after update`);
      return updated;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error updating status for task ${id}`, error as Error);
      throw new InternalServerErrorException('Failed to update task status');
    }
  }

  async batchUpdateStatus(
    taskIds: string[],
    status: TaskStatus,
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    if (!taskIds?.length) return { success, failed };

    try {
      const existing = await this.tasksRepository.find({
        where: { id: In(taskIds) },
        select: ['id'],
      });
      const existingIds = existing.map(e => e.id);
      const missing = taskIds.filter(id => !existingIds.includes(id));

      if (existingIds.length) {
        await this.tasksRepository
          .createQueryBuilder()
          .update(Task)
          .set({ status })
          .where('id IN (:...ids)', { ids: existingIds })
          .execute();
        success.push(...existingIds);
      }

      for (const id of missing) failed.push({ id, error: 'Task not found' });
      return { success, failed };
    } catch (error) {
      this.logger.error('Error in batchUpdateStatus', error as Error);
      throw new InternalServerErrorException('Failed to update tasks in batch');
    }
  }

  async batchRemove(
    taskIds: string[],
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    if (!taskIds?.length) return { success, failed };

    try {
      const existing = await this.tasksRepository.find({
        where: { id: In(taskIds) },
        select: ['id'],
      });
      const existingIds = existing.map(e => e.id);
      const missing = taskIds.filter(id => !existingIds.includes(id));

      if (existingIds.length) {
        await this.tasksRepository.delete(existingIds);
        success.push(...existingIds);
      }

      for (const id of missing) failed.push({ id, error: 'Task not found' });
      return { success, failed };
    } catch (error) {
      this.logger.error('Error in batchRemove', error as Error);
      throw new InternalServerErrorException('Failed to delete tasks in batch');
    }
  }

  async getStats(): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    highPriority: number;
  }> {
    try {
      const raw = await this.tasksRepository
        .createQueryBuilder('t')
        .select('COUNT(*)', 'total')
        .addSelect(`SUM(CASE WHEN t.status = :completed THEN 1 ELSE 0 END)`, 'completed')
        .addSelect(`SUM(CASE WHEN t.status = :inProgress THEN 1 ELSE 0 END)`, 'inProgress')
        .addSelect(`SUM(CASE WHEN t.status = :pending THEN 1 ELSE 0 END)`, 'pending')
        .addSelect(`SUM(CASE WHEN t.priority = :high THEN 1 ELSE 0 END)`, 'highPriority')
        .setParameters({
          completed: TaskStatus.COMPLETED,
          inProgress: TaskStatus.IN_PROGRESS,
          pending: TaskStatus.PENDING,
          high: TaskPriority.HIGH,
        })
        .getRawOne<{
          total: string;
          completed: string;
          inProgress: string;
          pending: string;
          highPriority: string;
        }>();

      return {
        total: Number(raw?.total ?? 0),
        completed: Number(raw?.completed ?? 0),
        inProgress: Number(raw?.inProgress ?? 0),
        pending: Number(raw?.pending ?? 0),
        highPriority: Number(raw?.highPriority ?? 0),
      };
    } catch (error) {
      this.logger.error('Error fetching task stats', error as Error);
      throw new InternalServerErrorException('Could not retrieve task statistics');
    }
  }
}
