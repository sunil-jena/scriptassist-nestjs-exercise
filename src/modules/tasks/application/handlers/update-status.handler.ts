import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { UnitOfWork } from '../../../../common/database/unit-of-work';
import { UpdateStatusCommand } from '../commands/update-status.command';
import { TaskRepositoryImpl } from '../../infra/typeorm/task.repository.impl';
import { NotFoundException } from '@nestjs/common';

@CommandHandler(UpdateStatusCommand)
export class UpdateStatusHandler implements ICommandHandler<UpdateStatusCommand> {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(cmd: UpdateStatusCommand) {
    return this.uow.withTransaction(async (em: EntityManager, collect) => {
      const repo = new TaskRepositoryImpl(em);
      const task = await repo.findById(cmd.id);
      if (!task) throw new NotFoundException(`Task ${cmd.id} not found`);
      task.changeStatus(cmd.status);
      await repo.save(task);
      collect(task.pullEvents());
      return task.id;
    });
  }
}
