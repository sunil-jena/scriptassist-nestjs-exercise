import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { UnitOfWork } from '../../../../common/database/unit-of-work';
import { UpdateTaskCommand } from '../commands/update-task.command';
import { TaskRepositoryImpl } from '../../infra/typeorm/task.repository.impl';
import { NotFoundException } from '@nestjs/common';

@CommandHandler(UpdateTaskCommand)
export class UpdateTaskHandler implements ICommandHandler<UpdateTaskCommand> {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(cmd: UpdateTaskCommand) {
    return this.uow.withTransaction(async (em: EntityManager, collect) => {
      const repo = new TaskRepositoryImpl(em);
      const task = await repo.findById(cmd.id);
      if (!task) throw new NotFoundException(`Task ${cmd.id} not found`);
      task.update(cmd.data);
      await repo.save(task);
      collect(task.pullEvents());
      return task.id;
    });
  }
}
