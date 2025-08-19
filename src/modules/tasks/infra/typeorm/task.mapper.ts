/* eslint-disable @typescript-eslint/no-explicit-any */
import { Task } from '../../domain/task.aggregate';
import { TaskProps } from '../../domain/task.types';
import { Task as TaskEntity } from '../../entities/task.entity';

export const TaskMapper = {
  toEntity(t: Task): TaskEntity {
    const d = t.data;
    const e = new TaskEntity();
    (e as any).id = d.id;
    (e as any).title = d.title;
    (e as any).description = d.description ?? null;
    (e as any).status = d.status;
    (e as any).priority = d.priority;
    (e as any).userId = d.userId ?? null;
    (e as any).assigneeId = d.assigneeId ?? null;
    (e as any).dueDate = d.dueDate ?? null;
    (e as any).createdAt = d.createdAt;
    (e as any).updatedAt = d.updatedAt;
    return e;
  },
  toDomain(e: TaskEntity): Task {
    const p: TaskProps = {
      id: (e as any).id,
      title: (e as any).title,
      description: (e as any).description ?? null,
      status: (e as any).status,
      priority: (e as any).priority,
      userId: (e as any).userId ?? null,
      assigneeId: (e as any).assigneeId ?? null,
      dueDate: (e as any).dueDate ?? null,
      createdAt: (e as any).createdAt,
      updatedAt: (e as any).updatedAt,
    };
    return Task.rehydrate(p);
  },
};
