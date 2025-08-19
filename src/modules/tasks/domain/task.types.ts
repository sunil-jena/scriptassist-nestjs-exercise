import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';

export interface TaskProps {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  userId?: string | null;
  assigneeId?: string | null;
  dueDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
