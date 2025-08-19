/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';

export type TxWork<T> = (em: EntityManager, collect: (events: any | any[]) => void) => Promise<T>;

@Injectable()
export class UnitOfWork {
  constructor(private readonly ds: DataSource) {}

  async withTransaction<T>(work: TxWork<T>): Promise<T> {
    const qr: QueryRunner = this.ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const staged: any[] = [];

    try {
      const result = await work(qr.manager, ev => {
        if (!ev) return;
        if (Array.isArray(ev)) staged.push(...ev);
        else staged.push(ev);
      });

      if (staged.length) {
        await qr.manager
          .createQueryBuilder()
          .insert()
          .into('outbox_events')
          .values(
            staged.map(e => ({
              aggregate_type: e.aggregateType ?? 'task',
              aggregate_id: e.taskId ?? e.aggregateId,
              type: e.type,
              payload: e,
              status: 'pending',
            })),
          )
          .execute();
      }

      await qr.commitTransaction();
      return result;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }
}
