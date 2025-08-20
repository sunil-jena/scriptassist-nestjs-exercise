/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prettier/prettier */
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskFilterDto } from './dto/task-filter.dto';
import { TaskStatus } from './enums/task-status.enum';

import { CreateTaskCommand } from './application/commands/create-task.command';
import { UpdateTaskCommand } from './application/commands/update-task.command';
import { DeleteTaskCommand } from './application/commands/delete-task.command';
import { BatchUpdateStatusCommand } from './application/commands/batch-update-status.command';
import { BatchRemoveCommand } from './application/commands/batch-remove.command';
import { ListTasksQuery } from './application/queries/list-tasks.query';
import { GetTaskQuery } from './application/queries/get-task.query';
import { GetTaskStatsQuery } from './application/queries/get-task-stats.query';
import { TaskPriority } from './enums/task-priority.enum';
import { parseISOToDateOrThrow } from '@common/utils/date';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  async create(@Body() dto: CreateTaskDto) {

      const dueDate = parseISOToDateOrThrow(dto.dueDate ?? null)
    return this.commandBus.execute(new CreateTaskCommand({
      title: dto.title,
      description: dto.description ?? null,
      priority: dto.priority ?? TaskPriority.MEDIUM,
      userId: dto.userId ?? null,
      dueDate: dueDate,
      status: dto.status ?? TaskStatus.PENDING,
    }));
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async findAll(@Query() filter: TaskFilterDto) {
    return this.queryBus.execute(new ListTasksQuery(filter as any));
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    return this.queryBus.execute(new GetTaskStatsQuery());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    const task = await this.queryBus.execute(new GetTaskQuery(id));
    if (!task) throw new HttpException(`Task with ID ${id} not found`, HttpStatus.NOT_FOUND);
    return task;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.commandBus.execute(new UpdateTaskCommand(id, dto as any));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  async remove(@Param('id') id: string) {
    return this.commandBus.execute(new DeleteTaskCommand(id));
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(@Body() operations: { tasks: string[]; action: string }) {
    const { tasks: taskIds, action } = operations;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      throw new HttpException('Task IDs are required', HttpStatus.BAD_REQUEST);
    }
    switch (action) {
      case 'complete':
        return this.commandBus.execute(new BatchUpdateStatusCommand(taskIds, TaskStatus.COMPLETED));
      case 'delete':
        return this.commandBus.execute(new BatchRemoveCommand(taskIds));
      default:
        throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
    }
  }
}
