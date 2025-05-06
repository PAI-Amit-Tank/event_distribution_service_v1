import { Pool } from 'pg';

interface RequeueResult {
    processed: number;
    requeued: number;
    errors: number;
}

export class RequeueService {
     private dbPool: Pool;

    constructor(dbPool: Pool) {
        this.dbPool = dbPool;
        console.log('[service]: RequeueService instantiated.');
    }

    async requeueTimedOutEvents(): Promise<RequeueResult> {
        const result: RequeueResult = { processed: 0, requeued: 0, errors: 0 };
        const client = await this.dbPool.connect();
        console.log('[service]: Database client acquired for re-queue.');
        try {
            let ttlMinutes = parseInt(process.env.EVENT_ASSIGNMENT_TTL_MINUTES || '30');
            if (isNaN(ttlMinutes) || ttlMinutes <= 0) {
                const defaultTtl = 30;
                console.error(`[service]: Invalid EVENT_ASSIGNMENT_TTL_MINUTES: '${process.env.EVENT_ASSIGNMENT_TTL_MINUTES}'. Using default ${defaultTtl}.`);
                ttlMinutes = defaultTtl;
            }
            const interval = `${ttlMinutes} minutes`;
            console.log(`[service]: Checking for events assigned longer than ${interval}...`);

            const findQuery = `
              SELECT event_id
              FROM events
              WHERE status = $1 AND assigned_at < (NOW() - $2::interval)
            `;
    
            const findResult = await client.query(findQuery, ['Assigned', interval]);
            const timedOutEventIds: string[] = findResult.rows.map(row => row.event_id);

            result.processed = timedOutEventIds.length;

            if (timedOutEventIds.length === 0) {
                console.log('[service]: No timed-out events found.');
                // No error, just nothing to do
            } else {
                console.log(`[service]: Found ${timedOutEventIds.length} timed-out events. Re-queuing...`);
                await client.query('BEGIN');
                const updateQuery = `
                UPDATE events
                SET status = $1, assigned_user_id = NULL, assigned_at = NULL
                WHERE event_id = ANY($2::uuid[]) AND status = $3 -- Ensure status is still 'Assigned'
                `;
                const updateResult = await client.query(updateQuery, ['Pending', timedOutEventIds, 'Assigned']);
                await client.query('COMMIT');

                result.requeued = updateResult.rowCount!;
                console.log(`[service]: Successfully re-queued ${result.requeued} events.`);
                if (result.requeued !== result.processed) {
                    console.warn(`[service]: Mismatch in processed vs requeued count. ${result.processed} found, ${result.requeued} updated. Some might have changed status concurrently.`);
                }
            }

        } catch (error: any) {
            console.error('[service]: Error during event re-queue operation:', error);
             if (client) {
                 try {
                     await client.query('ROLLBACK');
                     console.log('[service]: Re-queue transaction rolled back due to error.');
                 } catch (rbError: any) {
                     if (rbError.code !== '25P01') {
                         console.error('[service]: Error during re-queue rollback attempt:', rbError);
                     }
                 }
             }
            result.errors++;
        } finally {
            client.release();
             console.log('[service]: Database client released.');
        }
        return result;
    }
}
