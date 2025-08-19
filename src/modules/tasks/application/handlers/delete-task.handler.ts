import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager } from 'typeorm';
import { UnitOfWork } from '../../../../common/database/unit-of-work';
import { DeleteTaskCommand } from '../commands/delete-task.command';
import { TaskRepositoryImpl } from '../../infra/typeorm/task.repository.impl';
import { NotFoundException } from '@nestjs/common';

@CommandHandler(DeleteTaskCommand)
export class DeleteTaskHandler implements ICommandHandler<DeleteTaskCommand> {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(cmd: DeleteTaskCommand) {
    return this.uow.withTransaction(async (em: EntityManager) => {
      const repo = new TaskRepositoryImpl(em);
      const exists = await repo.findById(cmd.id);
      if (!exists) throw new NotFoundException(`Task ${cmd.id} not found`);
      await repo.delete(cmd.id);
      return { id: cmd.id };
    });
  }
}
