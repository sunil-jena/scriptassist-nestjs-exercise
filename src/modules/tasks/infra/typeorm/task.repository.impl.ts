import { EntityManager, Repository } from 'typeorm';
import { ITaskRepository } from '../../domain/ports/task.repository';
import { Task } from '../../domain/task.aggregate';
import { Task as TaskEntity } from '../../entities/task.entity';
import { TaskMapper } from './task.mapper';

export class TaskRepositoryImpl implements ITaskRepository {
  private repo: Repository<TaskEntity>;
  constructor(private readonly em: EntityManager) {
    this.repo = em.getRepository(TaskEntity);
  }

  async save(task: Task): Promise<void> {
    await this.repo.save(TaskMapper.toEntity(task));
  }

  async findById(id: string): Promise<Task | null> {
    const row = await this.repo.findOne({ where: { id }, withDeleted: false });
    return row ? TaskMapper.toDomain(row) : null;
  }

  async delete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }
}
