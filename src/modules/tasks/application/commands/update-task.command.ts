import { TaskPriority } from '@modules/tasks/enums/task-priority.enum';
import { TaskStatus } from '@modules/tasks/enums/task-status.enum';

export class UpdateTaskCommand {
  constructor(
    public readonly id: string,
    public readonly data: Partial<{
      title: string;
      description: string | null;
      priority: TaskPriority;
      dueDate: Date | null;
      status: TaskStatus;
      assigneeId: string | null;
    }>,
  ) {}
}
