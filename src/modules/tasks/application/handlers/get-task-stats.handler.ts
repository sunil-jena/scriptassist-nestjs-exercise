import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetTaskStatsQuery } from '../queries/get-task-stats.query';
import { TaskStatus } from '../../enums/task-status.enum';
import { TaskPriority } from '../../enums/task-priority.enum';
import { Task as TaskEntity } from '../../entities/task.entity';

@QueryHandler(GetTaskStatsQuery)
export class GetTaskStatsHandler implements IQueryHandler<GetTaskStatsQuery> {
  constructor(private readonly em: EntityManager) {}

  async execute(_: GetTaskStatsQuery) {
    const repo = this.em.getRepository(TaskEntity);

    const total = await repo.count();

    const statusCounts = await repo
      .createQueryBuilder('task')
      .select('task.status', 'status')
      .addSelect('COUNT(task.id)', 'count')
      .groupBy('task.status')
      .getRawMany<{ status: TaskStatus; count: string }>();

    const priorityCounts = await repo
      .createQueryBuilder('task')
      .select('task.priority', 'priority')
      .addSelect('COUNT(task.id)', 'count')
      .groupBy('task.priority')
      .getRawMany<{ priority: TaskPriority; count: string }>();

    const smap = Object.fromEntries(statusCounts.map(r => [r.status, Number(r.count)]));
    const pmap = Object.fromEntries(priorityCounts.map(r => [r.priority, Number(r.count)]));

    return {
      total,
      completed: smap[TaskStatus.COMPLETED] || 0,
      inProgress: smap[TaskStatus.IN_PROGRESS] || 0,
      pending: smap[TaskStatus.PENDING] || 0,
      highPriority: pmap[TaskPriority.HIGH] || 0,
    };
  }
}
