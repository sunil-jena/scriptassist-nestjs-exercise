import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { GetTaskQuery } from '../queries/get-task.query';
import { TaskReadRepositoryImpl } from '../../infra/typeorm/task.read.repository.impl';

@QueryHandler(GetTaskQuery)
export class GetTaskHandler implements IQueryHandler<GetTaskQuery> {
  constructor(private readonly em: EntityManager) {}
  async execute(q: GetTaskQuery) {
    const readRepo = new TaskReadRepositoryImpl(this.em);
    return readRepo.getById(q.id);
  }
}
