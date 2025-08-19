/* eslint-disable @typescript-eslint/no-unused-vars */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

type SortField = 'createdAt' | 'updatedAt' | 'dueDate' | 'priority' | 'status';
type SortOrder = 'ASC' | 'DESC';

export class TaskFilterDto {
  // ----------- CORE FILTERS -----------

  @ApiPropertyOptional({ enum: TaskStatus, description: 'Filter by single task status' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional({
    isArray: true,
    enum: TaskStatus,
    description: 'Filter by multiple task statuses (OR)',
    example: [TaskStatus.todo, TaskStatus.in_progress],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(TaskStatus, { each: true })
  statusIn?: TaskStatus[];

  @ApiPropertyOptional({ enum: TaskPriority, description: 'Filter by single task priority' })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiPropertyOptional({
    isArray: true,
    enum: TaskPriority,
    description: 'Filter by multiple priorities (OR)',
    example: [TaskPriority.medium, TaskPriority.high],
  })
  @IsOptional()
  @IsArray()
  @IsEnum(TaskPriority, { each: true })
  priorityIn?: TaskPriority[];

  @ApiPropertyOptional({
    description: 'Filter by owner/creator user id (UUID)',
    example: 'f4b5b6c7-d8e9-4a0b-9123-4567890abcde',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filter by assignee user id (UUID)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
  })
  @IsOptional()
  @IsUUID('4')
  assigneeId?: string;

  @ApiPropertyOptional({
    description: 'Free-text search on title and description (case-insensitive)',
    example: 'refactor pagination',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  search?: string;

  @ApiPropertyOptional({
    description: 'Include soft-deleted tasks',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeDeleted?: boolean = false;

  // ----------- DATE RANGES -----------

  @ApiPropertyOptional({
    description: 'Due date from (inclusive, ISO8601)',
    example: '2025-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueFrom?: Date;

  @ApiPropertyOptional({
    description: 'Due date to (inclusive, ISO8601)',
    example: '2025-08-31T23:59:59.999Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueTo?: Date;

  @ApiPropertyOptional({
    description: 'Created at from (inclusive, ISO8601)',
    example: '2025-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdFrom?: Date;

  @ApiPropertyOptional({
    description: 'Created at to (inclusive, ISO8601)',
    example: '2025-08-31T23:59:59.999Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdTo?: Date;

  // ----------- SORTING -----------

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'updatedAt', 'dueDate', 'priority', 'status'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sort?: SortField = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsString()
  order?: SortOrder = 'DESC';

  // ----------- PAGINATION (OFFSET) -----------

  @ApiPropertyOptional({ description: 'Page number (1-based)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  // ----------- PAGINATION (KEYSET / CURSOR) -----------
  // If cursor params are provided, they should take precedence over page+limit in the repository layer.

  @ApiPropertyOptional({
    description:
      'Keyset cursor: last item createdAt value from previous page (ISO8601). When provided with cursorId, enables keyset pagination.',
    example: '2025-08-20T10:15:30.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  cursorCreatedAt?: Date;

  @ApiPropertyOptional({
    description:
      'Keyset cursor: last item id from previous page. When provided with cursorCreatedAt, enables keyset pagination.',
    example: 'b9d9b182-1c4c-4a8f-9d20-7198e7ba0f0a',
  })
  @IsOptional()
  @IsUUID('4')
  cursorId?: string;

  // Ensure both keyset fields are provided together
  @ValidateIf((o: TaskFilterDto) => o.cursorCreatedAt !== undefined || o.cursorId !== undefined)
  private _bothOrNone?: void;
}
