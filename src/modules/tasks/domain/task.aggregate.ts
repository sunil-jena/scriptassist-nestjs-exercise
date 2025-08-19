/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from 'crypto';
import { TaskProps } from './task.types';
import { TaskPriority } from '../enums/task-priority.enum';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskCreatedEvent } from './events/task-created.event';
import { TaskStatusChangedEvent } from './events/task-status-changed.event';

export class Task {
  private events: Array<TaskCreatedEvent | TaskStatusChangedEvent> = [];
  private constructor(private props: TaskProps) {}

  static create(input: {
    title: string;
    description?: string | null;
    priority: TaskPriority;
    userId?: string | null;
    assigneeId?: string | null;
    dueDate?: Date | null;
    status?: TaskStatus;
  }): Task {
    const now = new Date();
    const t = new Task({
      id: randomUUID(),
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? TaskStatus.PENDING,
      priority: input.priority,
      userId: input.userId ?? null,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
    });
    t.record(new TaskCreatedEvent(t.props.id, t.props.userId ?? null));
    return t;
  }

  static rehydrate(props: TaskProps): Task {
    return new Task({ ...props });
  }

  update(
    fields: Partial<
      Pick<TaskProps, 'title' | 'description' | 'priority' | 'dueDate' | 'status' | 'assigneeId'>
    >,
  ) {
    const prevStatus = this.props.status;
    if (fields.title !== undefined) this.props.title = fields.title;
    if (fields.description !== undefined) this.props.description = fields.description ?? null;
    if (fields.priority !== undefined) this.props.priority = fields.priority;
    if (fields.dueDate !== undefined) this.props.dueDate = fields.dueDate ?? null;
    if (fields.assigneeId !== undefined) this.props.assigneeId = fields.assigneeId ?? null;
    if (fields.status !== undefined && fields.status !== prevStatus) {
      this.props.status = fields.status;
      this.record(new TaskStatusChangedEvent(this.props.id, prevStatus, fields.status));
    }
    this.props.updatedAt = new Date();
  }

  changeStatus(to: TaskStatus) {
    if (this.props.status === to) return;
    const from = this.props.status;
    this.props.status = to;
    this.props.updatedAt = new Date();
    this.record(new TaskStatusChangedEvent(this.props.id, from, to));
  }

  pullEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
  private record(e: any) {
    this.events.push(e);
  }

  get id() {
    return this.props.id;
  }
  get data(): TaskProps {
    return { ...this.props };
  }
}
