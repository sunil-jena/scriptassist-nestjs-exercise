import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EntityManager, In } from 'typeorm';
import { UnitOfWork } from '../../../../common/database/unit-of-work';
import { BatchRemoveCommand } from '../commands/batch-remove.command';
import { Task as TaskEntity } from '../../entities/task.entity';

@CommandHandler(BatchRemoveCommand)
export class BatchRemoveHandler implements ICommandHandler<BatchRemoveCommand> {
  constructor(private readonly uow: UnitOfWork) {}

  async execute(cmd: BatchRemoveCommand) {
    return this.uow.withTransaction(async (em: EntityManager) => {
      if (!cmd.ids?.length) return { success: [], failed: [] };
      const repo = em.getRepository(TaskEntity);

      const existing = await repo.find({ where: { id: In(cmd.ids) }, select: ['id'] });
      const existingIds = existing.map(e => e.id);
      const missing = cmd.ids.filter(id => !existingIds.includes(id));

      if (existingIds.length) await repo.softDelete({ id: In(existingIds) });

      return { success: existingIds, failed: missing.map(id => ({ id, error: 'Task not found' })) };
    });
  }
}
