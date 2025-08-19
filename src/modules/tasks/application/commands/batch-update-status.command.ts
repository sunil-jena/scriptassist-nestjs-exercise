import { TaskStatus } from '@modules/tasks/enums/task-status.enum';

export class BatchUpdateStatusCommand {
  constructor(
    public readonly ids: string[],
    public readonly status: TaskStatus,
  ) {}
}
