import { Task } from '../task.aggregate';
export interface ITaskRepository {
  save(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  delete(id: string): Promise<void>;
}
