import { Pool } from 'pg';

interface AssignedEvent {
    eventId: string;
    externalEventId: string | null;
    region: string;
    payload: any;
}

export class AssignmentService {
    private dbPool: Pool;

    constructor(dbPool: Pool) {
        this.dbPool = dbPool;
        console.log('[service]: AssignmentService instantiated.');
    }

    private async getTeamConfig(teamId: string): Promise<{ allowedRegions: string[], batchSize: number }> {
        // TODO: Query 'teams' and 'team_regions' tables based on teamId
        console.warn(`[service]: Using placeholder config for team ${teamId}`);
        const allowedRegions = teamId === 'mock-team-beta' ? ['eu-west-1'] : ['us-east-1', 'ca-central-1'];
        const batchSize = parseInt(process.env.DEFAULT_BATCH_SIZE || '10');
        return { allowedRegions, batchSize };
    }

    async assignBatch(userId: string, teamId: string): Promise<any[]> {
        console.log(`[service]: Assigning batch to user ${userId} from team ${teamId}`);

        const { allowedRegions, batchSize } = await this.getTeamConfig(teamId);

        if (!allowedRegions || allowedRegions.length === 0) {
            console.log(`[service]: Team ${teamId} has no configured regions.`);
            return [];
        }

        const client = await this.dbPool.connect();
        console.log('[service]: Database client acquired for assignment.');
        try {
          await client.query('BEGIN');
          console.log('[service]: Transaction started.');

          const lockQuery = `
            SELECT event_id
            FROM events
            WHERE status = $1 AND region_code = ANY($2::varchar[])
            ORDER BY ingested_at -- Prioritize older events
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          `;
          console.log('[service]: Executing lock query...');
          const lockResult = await client.query(lockQuery, ['Pending', allowedRegions, batchSize]);
          const eventIds: string[] = lockResult.rows.map(e => e.event_id);
          console.log(`[service]: Found and locked ${eventIds.length} events.`);

          if (eventIds.length > 0) {
            const updateQuery = `
              UPDATE events
              SET status = $1, assigned_user_id = $2, assigned_at = NOW()
              WHERE event_id = ANY($3::uuid[])
            `;
             console.log('[service]: Executing update query...');
            const updateResult = await client.query(updateQuery, ['Assigned', userId, eventIds]);
            console.log(`[service]: Updated ${updateResult.rowCount} events to Assigned.`);

            const selectQuery = `
              SELECT event_id as "eventId", external_event_id as "externalEventId", region_code as "region", event_payload as "payload"
              FROM events
              WHERE event_id = ANY($1::uuid[])
            `;
            console.log('[service]: Executing select query for assigned events...');
            const assignedEventsResult = await client.query(selectQuery, [eventIds]);

            await client.query('COMMIT');
            console.log('[service]: Transaction committed.');
            return assignedEventsResult.rows;

          } else {
            console.log('[service]: No assignable events found or all eligible were locked.');
            await client.query('COMMIT');
            return [];
          }
        } catch (err: any) {
          console.error("[service]: Error during assignment transaction, rolling back:", err);
          await client.query('ROLLBACK');
          throw new Error("Failed to assign event batch due to database error.");
        } finally {
          client.release();
          console.log('[service]: Database client released.');
        }
    }
}