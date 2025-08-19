/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ListTasksFilter {
  status?: string;
  priority?: string;
  search?: string;
  userId?: string;
  assigneeId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  sort?: 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'status';
  order?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
  cursorCreatedAt?: Date;
  cursorId?: string;
}
export interface ListTasksResult {
  data: any[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
  nextCursor?: any;
}
export interface ITaskReadRepository {
  list(filter: ListTasksFilter): Promise<ListTasksResult>;
  getById(id: string): Promise<any | null>;
}
