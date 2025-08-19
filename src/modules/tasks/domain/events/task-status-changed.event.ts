export class TaskStatusChangedEvent {
  readonly type = 'TaskStatusChanged';
  readonly aggregateType = 'task';
  constructor(
    public readonly taskId: string,
    public readonly from: string,
    public readonly to: string,
  ) {}
}
