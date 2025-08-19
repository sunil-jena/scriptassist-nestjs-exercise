import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { CqrsModule } from '@nestjs/cqrs';

import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { OutboxEvent } from '../../common/database/outbox-event.entity';
import { UnitOfWork } from '../../common/database/unit-of-work';

import { CreateTaskHandler } from './application/handlers/create-task.handler';
import { UpdateTaskHandler } from './application/handlers/update-task.handler';
import { DeleteTaskHandler } from './application/handlers/delete-task.handler';
import { UpdateStatusHandler } from './application/handlers/update-status.handler';
import { BatchUpdateStatusHandler } from './application/handlers/batch-update-status.handler';
import { BatchRemoveHandler } from './application/handlers/batch-remove.handler';
import { ListTasksHandler } from './application/handlers/list-tasks.handler';
import { GetTaskHandler } from './application/handlers/get-task.handler';
import { GetTaskStatsHandler } from './application/handlers/get-task-stats.handler';
import { TasksService } from './tasks.service';

const CommandHandlers = [
  CreateTaskHandler,
  UpdateTaskHandler,
  DeleteTaskHandler,
  UpdateStatusHandler,
  BatchUpdateStatusHandler,
  BatchRemoveHandler,
];

const QueryHandlers = [ListTasksHandler, GetTaskHandler, GetTaskStatsHandler];

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Task, OutboxEvent]),
    BullModule.registerQueue({ name: 'task-processing' }),
  ],
  controllers: [TasksController],
  providers: [UnitOfWork, TasksService, ...CommandHandlers, ...QueryHandlers],
  exports: [TasksService],
})
export class TasksModule {}
