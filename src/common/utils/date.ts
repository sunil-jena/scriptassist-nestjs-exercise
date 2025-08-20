import { BadRequestException } from '@nestjs/common';

export function parseISOToDateOrThrow(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException('dueDate must be a valid ISO 8601 date string');
  }
  // normalize to UTC (stable canonical)
  return new Date(d.toISOString());
}
