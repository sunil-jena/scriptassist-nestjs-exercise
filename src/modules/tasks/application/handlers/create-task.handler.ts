import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { UnitOfWork } from '../../../../common/database/unit-of-work';
import { CreateTaskCommand } from '../commands/create-task.command';
import { Task } from '../../domain/task.aggregate';
import { TaskRepositoryImpl } from '../../infra/typeorm/task.repository.impl';

@CommandHandler(CreateTaskCommand)
export class CreateTaskHandler implements ICommandHandler<CreateTaskCommand> {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(cmd: CreateTaskCommand) {
    return this.uow.withTransaction(async (em: EntityManager, collect) => {
      const repo = new TaskRepositoryImpl(em);
      const task = Task.create(cmd.input);
      await repo.save(task);
      collect(task.pullEvents());
      return task.id;
    });
  }
}
