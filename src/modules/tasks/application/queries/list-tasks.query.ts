import { ListTasksFilter } from '../../domain/ports/task.read.repository';
export class ListTasksQuery {
  constructor(public readonly filter: ListTasksFilter) {}
}
