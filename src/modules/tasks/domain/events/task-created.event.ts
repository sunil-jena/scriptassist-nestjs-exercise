export class TaskCreatedEvent {
  readonly type = 'TaskCreated';
  readonly aggregateType = 'task';
  constructor(
    public readonly taskId: string,
    public readonly userId?: string | null,
  ) {}
}
