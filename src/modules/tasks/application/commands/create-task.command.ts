import { TaskPriority } from '@modules/tasks/enums/task-priority.enum';
import { TaskStatus } from '@modules/tasks/enums/task-status.enum';

export class CreateTaskCommand {
  constructor(
    public readonly input: {
      title: string;
      description?: string | null;
      priority: TaskPriority;
      userId?: string | null;
      assigneeId?: string | null;
      dueDate?: Date | null;
      status?: TaskStatus;
    },
  ) {}
}
