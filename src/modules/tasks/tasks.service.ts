/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private readonly taskQueue: Queue,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Inefficient implementation: creates the task but doesn't use a single transaction
    // for creating and adding to queue, potential for inconsistent state
    try {
      const task = this.tasksRepository.create(createTaskDto);
      const savedTask = await this.tasksRepository.save(task);

      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      });
      return savedTask;
    } catch (error) {
      console.error('Error creating task:', error);
      throw new InternalServerErrorException('Failed to create task');
    }
  }

  async findAll(
    status?: TaskStatus,
    priority?: TaskPriority,
    page?: number,
    limit?: number,
  ): Promise<{ data: Task[]; total: number; page: number; limit: number; totalPages: number }> {
    try {
      const pageNum = Number(page) > 0 ? Number(page) : 1;
      const limitNum = Number(limit) > 0 ? Number(limit) : 10;
      const query = this.tasksRepository
        .createQueryBuilder('task')
        .leftJoinAndSelect('task.user', 'user')
        .orderBy('task.createdAt', 'DESC')
        .skip((pageNum - 1) * limitNum)
        .take(limitNum);

      if (status) {
        query.andWhere('task.status = :status', { status });
      }

      if (priority) {
        query.andWhere('task.priority = :priority', { priority });
      }

      const [data, total] = await query.getManyAndCount();
      return {
        data,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      };
    } catch (error) {
      console.error('Database error in findAll:', error);
      throw new InternalServerErrorException('Could not retrieve tasks');
    }
  }

  async findOne(id: string): Promise<Task> {
    // Inefficient implementation: two separate database calls
    // const count = await this.tasksRepository.count({ where: { id } });

    // if (count === 0) {
    //   throw new NotFoundException(`Task with ID ${id} not found`);
    // }

    try {
      const task: Task | null = await this.tasksRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      return task as Task;
    } catch (error) {
      console.error(`Error fetching task with ID ${id}:`, error);
      throw new InternalServerErrorException('Failed to fetch task');
    }
    // return (await this.tasksRepository.findOne({
    //   where: { id },
    //   relations: ['user'],
    // })) as Task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    // Inefficient implementation: multiple database calls
    // and no transaction handling
    try {
      const task: Task | null = await this.tasksRepository.findOne({ where: { id } });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus: TaskStatus = task.status;

      Object.assign(task, updateTaskDto);

      const updatedTask: Task = await this.tasksRepository.save(task);

      // If status changed, add to queue
      if (originalStatus !== updatedTask.status) {
        try {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        } catch (queueError: unknown) {
          console.error(`Failed to enqueue task update for ID ${id}:`, queueError);
        }
      }

      return updatedTask;
    } catch (error: unknown) {
      console.error(`Error updating task with ID ${id}:`, error);
      throw new InternalServerErrorException('Failed to update task');
    }
  }

  async remove(id: string): Promise<void> {
    // Inefficient implementation: two separate database calls
    try {
      const result = await this.tasksRepository.delete(id);

      if (result.affected === 0) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
    } catch (error: unknown) {
      console.error(`Error deleting task with ID ${id}:`, error);
      throw new InternalServerErrorException('Failed to delete task');
    }
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    try {
      return await this.tasksRepository.find({
        where: { status },
        relations: ['user'],
      });
    } catch (error: unknown) {
      console.error(`Error finding tasks by status ${status}:`, error);
      throw new InternalServerErrorException('Failed to fetch tasks by status');
    }
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    try {
      const task: Task | null = await this.tasksRepository.findOne({
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      task.status = status as TaskStatus;
      return await this.tasksRepository.save(task);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error(`Error updating status for task ${id}:`, error);
      throw new InternalServerErrorException('Failed to update task status');
    }
  }

  async batchUpdateStatus(
    taskIds: string[],
    status: TaskStatus,
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    try {
      const tasks = await this.tasksRepository.findByIds(taskIds);

      const foundIds = tasks.map(t => t.id);
      const missing = taskIds.filter(id => !foundIds.includes(id));

      if (tasks.length > 0) {
        for (const task of tasks) {
          task.status = status;
        }
        await this.tasksRepository.save(tasks);
        success.push(...foundIds);
      }

      for (const id of missing) {
        failed.push({ id, error: 'Task not found' });
      }

      return { success, failed };
    } catch (error: unknown) {
      console.error('Error in batchUpdateStatus:', error);
      throw new InternalServerErrorException('Failed to update tasks in batch');
    }
  }

  async batchRemove(
    taskIds: string[],
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    try {
      const result = await this.tasksRepository.delete(taskIds);

      if (result.affected && result.affected > 0) {
        success.push(...taskIds);
      }

      if (!result.affected || result.affected < taskIds.length) {
        // Some tasks not found
        const deletedCount = result.affected || 0;
        const notFound = taskIds.slice(deletedCount);
        for (const id of notFound) {
          failed.push({ id, error: 'Task not found' });
        }
      }

      return { success, failed };
    } catch (error: unknown) {
      console.error('Error in batchRemove:', error);
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
      // Total tasks
      const total = await this.tasksRepository.count();

      // Status counts in one grouped query
      const statusCounts = await this.tasksRepository
        .createQueryBuilder('task')
        .select('task.status', 'status')
        .addSelect('COUNT(task.id)', 'count')
        .groupBy('task.status')
        .getRawMany();

      // Priority counts in one grouped query
      const priorityCounts = await this.tasksRepository
        .createQueryBuilder('task')
        .select('task.priority', 'priority')
        .addSelect('COUNT(task.id)', 'count')
        .groupBy('task.priority')
        .getRawMany();

      // Map results into object
      const statusMap: Record<string, number> = {};
      statusCounts.forEach(row => {
        statusMap[row.status] = Number(row.count);
      });

      const priorityMap: Record<string, number> = {};
      priorityCounts.forEach(row => {
        priorityMap[row.priority] = Number(row.count);
      });

      return {
        total,
        completed: statusMap[TaskStatus.COMPLETED] || 0,
        inProgress: statusMap[TaskStatus.IN_PROGRESS] || 0,
        pending: statusMap[TaskStatus.PENDING] || 0,
        highPriority: priorityMap[TaskPriority.HIGH] || 0,
      };
    } catch (error) {
      console.error('Error fetching task stats:', error);
      throw new InternalServerErrorException('Could not retrieve task statistics');
    }
  }
}
