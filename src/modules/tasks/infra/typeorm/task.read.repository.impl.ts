import { EntityManager } from 'typeorm';
import {
  ITaskReadRepository,
  ListTasksFilter,
  ListTasksResult,
} from '../../domain/ports/task.read.repository';
import { Task as TaskEntity } from '../../entities/task.entity';

export class TaskReadRepositoryImpl implements ITaskReadRepository {
  constructor(private readonly em: EntityManager) {}

  async list(f: ListTasksFilter): Promise<ListTasksResult> {
    const qb = this.em
      .getRepository(TaskEntity)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.user', 'user')
      .where('t.id IS NOT NULL');

    if (f.status) qb.andWhere('t.status = :s', { s: f.status });
    if (f.priority) qb.andWhere('t.priority = :p', { p: f.priority });
    if (f.search)
      qb.andWhere('(t.title ILIKE :q OR t.description ILIKE :q)', { q: `%${f.search}%` });
    if (f.userId) qb.andWhere('t.userId = :u', { u: f.userId });
    if (f.assigneeId) qb.andWhere('t.assigneeId = :a', { a: f.assigneeId });
    if (f.dueFrom) qb.andWhere('t.dueDate >= :df', { df: f.dueFrom });
    if (f.dueTo) qb.andWhere('t.dueDate <= :dt', { dt: f.dueTo });
    if (f.createdFrom) qb.andWhere('t.createdAt >= :cf', { cf: f.createdFrom });
    if (f.createdTo) qb.andWhere('t.createdAt <= :ct', { ct: f.createdTo });

    const sort = f.sort ?? 'createdAt';
    const order = (f.order ?? 'DESC').toUpperCase() as 'ASC' | 'DESC';
    qb.orderBy(`t.${sort}`, order).addOrderBy('t.id', order);

    // keyset
    if (f.cursorCreatedAt && f.cursorId) {
      if (order === 'DESC')
        qb.andWhere('(t.createdAt, t.id) < (:ca, :cid)', {
          ca: f.cursorCreatedAt,
          cid: f.cursorId,
        });
      else
        qb.andWhere('(t.createdAt, t.id) > (:ca, :cid)', {
          ca: f.cursorCreatedAt,
          cid: f.cursorId,
        });

      const take = Math.min(Math.max(f.limit ?? 20, 1), 100);
      qb.take(take);
      const data = await qb.getMany();
      const last = data[data.length - 1];
      const next = last ? { cursorCreatedAt: last.createdAt, cursorId: last.id } : null;
      return { data, nextCursor: next, page: 0, limit: take, totalPages: 0 };
    }

    // offset
    const page = Math.max(f.page ?? 1, 1);
    const limit = Math.min(Math.max(f.limit ?? 20, 1), 100);
    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getById(id: string) {
    return this.em.getRepository(TaskEntity).findOne({
      where: { id },
      relations: ['user'],
      withDeleted: false,
    });
  }
}
