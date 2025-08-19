import { TaskStatus } from '@modules/tasks/enums/task-status.enum';

export class UpdateStatusCommand {
  constructor(
    public readonly id: string,
    public readonly status: TaskStatus,
  ) {}
}
