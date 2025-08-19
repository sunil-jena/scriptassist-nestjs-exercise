import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { ListTasksQuery } from '../queries/list-tasks.query';
import { TaskReadRepositoryImpl } from '../../infra/typeorm/task.read.repository.impl';

@QueryHandler(ListTasksQuery)
export class ListTasksHandler implements IQueryHandler<ListTasksQuery> {
  constructor(private readonly em: EntityManager) {}
  async execute(q: ListTasksQuery) {
    const readRepo = new TaskReadRepositoryImpl(this.em);
    return readRepo.list(q.filter);
  }
}
